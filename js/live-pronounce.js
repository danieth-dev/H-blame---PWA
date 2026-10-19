/**
 * live-pronounce.js — Conexión Live aislada solo para pronunciar una palabra.
 * No toca la sesión de charla (singleton live.js).
 */
import { getDecryptedApiKey } from './gemini.js?v=26';

const MODEL = 'models/gemini-3.8-live';
const WS_PATH =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const VOICE = 'Aoede';
const OUTPUT_RATE = 24000;

const SYSTEM = `You are a pronunciation speaker only.
When given an English word, speak that single word aloud once, clearly, with natural stress.
Do not say anything else. Do not greet. Do not ask questions. Do not explain. Do not continue any conversation.`;

let _busy = false;
let _abort = null;

function base64ToUint8(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Pronuncia una palabra con Aoede en un WebSocket aparte.
 * @returns {Promise<boolean>}
 */
export async function pronounceWithLive(word) {
  const w = String(word || '').trim();
  if (!w) return false;
  if (_busy) {
    try {
      _abort?.();
    } catch (_) {}
  }

  const key = await getDecryptedApiKey();
  if (!key) throw new Error('NO_KEY');

  _busy = true;
  let ws = null;
  let playCtx = null;
  let playTime = 0;
  let heardAudio = false;
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    try {
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    } catch (_) {}
    ws = null;
    if (playCtx) {
      try {
        playCtx.close();
      } catch (_) {}
      playCtx = null;
    }
    _busy = false;
    _abort = null;
  };

  _abort = cleanup;

  const ensurePlay = async () => {
    if (!playCtx) {
      playCtx = new AudioContext({ sampleRate: OUTPUT_RATE });
      playTime = playCtx.currentTime;
    }
    if (playCtx.state === 'suspended') {
      try {
        await playCtx.resume();
      } catch (_) {}
    }
  };

  const queuePlayback = async (b64) => {
    await ensurePlay();
    const bytes = base64ToUint8(b64);
    const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
    if (!samples.length) return;
    heardAudio = true;
    const f32 = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) f32[i] = samples[i] / 0x8000;
    const buf = playCtx.createBuffer(1, f32.length, OUTPUT_RATE);
    buf.copyToChannel(f32, 0);
    const src = playCtx.createBufferSource();
    src.buffer = buf;
    src.connect(playCtx.destination);
    const startAt = Math.max(playCtx.currentTime, playTime);
    src.start(startAt);
    playTime = startAt + buf.duration;
  };

  const waitDrain = (ms = 6000) =>
    new Promise((resolve) => {
      const t0 = Date.now();
      const id = setInterval(() => {
        const done =
          !playCtx ||
          playCtx.state === 'closed' ||
          (playCtx && playCtx.currentTime >= playTime - 0.08);
        if (done || Date.now() - t0 > ms) {
          clearInterval(id);
          resolve();
        }
      }, 40);
    });

  try {
    await ensurePlay(); // desbloquear audio en el gesto del clic

    await new Promise((resolve, reject) => {
      let setupDone = false;
      let turnDone = false;
      const fail = (e) => {
        if (!closed) reject(e instanceof Error ? e : new Error(String(e)));
      };

      ws = new WebSocket(`${WS_PATH}?key=${encodeURIComponent(key)}`);

      const finishOk = async () => {
        if (turnDone) return;
        turnDone = true;
        await waitDrain(heardAudio ? 6000 : 500);
        resolve();
      };

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            setup: {
              model: MODEL,
              generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: VOICE },
                  },
                },
              },
              systemInstruction: { parts: [{ text: SYSTEM }] },
            },
          })
        );
      };

      ws.onmessage = async (ev) => {
        let msg;
        try {
          const data = typeof ev.data === 'string' ? ev.data : await ev.data.text();
          msg = JSON.parse(data);
        } catch (_) {
          return;
        }

        if (msg.setupComplete !== undefined) {
          if (setupDone) return;
          setupDone = true;
          ws.send(
            JSON.stringify({
              clientContent: {
                turns: [
                  {
                    role: 'user',
                    parts: [
                      {
                        text: `Speak only this English word once, then stop: ${w}`,
                      },
                    ],
                  },
                ],
                turnComplete: true,
              },
            })
          );
          return;
        }

        if (msg.error) {
          fail(new Error(msg.error.message || 'Live pronounce error'));
          return;
        }

        const sc = msg.serverContent;
        if (!sc) return;

        if (sc.modelTurn?.parts) {
          for (const part of sc.modelTurn.parts) {
            if (part.inlineData?.data) {
              try {
                await queuePlayback(part.inlineData.data);
              } catch (_) {}
            }
          }
        }

        if (sc.turnComplete || sc.generationComplete) {
          await finishOk();
        }
      };

      ws.onerror = () => fail(new Error('WS_PRONOUNCE_ERROR'));
      ws.onclose = () => {
        if (!setupDone && !turnDone) fail(new Error('WS_PRONOUNCE_CLOSED'));
        else if (!turnDone) finishOk();
      };

      setTimeout(() => {
        if (!turnDone) finishOk();
      }, 16000);
    });

    return heardAudio;
  } catch (e) {
    console.warn('pronounceWithLive:', e?.message || e);
    return false;
  } finally {
    cleanup();
  }
}
