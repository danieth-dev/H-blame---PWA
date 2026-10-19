/**
 * live.js — Servicio Gemini Live (singleton)
 * Posee WebSocket, micrófono, reproducción PCM y tool-calling.
 * La vista solo escucha eventos: started/stopped/listening/speaking/transcript/subtitle/error/tool
 *
 * Modelo: models/gemini-3.8-live — voz Aoede — PCM16 24 kHz salida
 * No enviar thinkingConfig. En UI solo outputTranscription.text (nunca part.text).
 */
import { getSetting, setSetting, getProfile, putProfile, getAllVocabulary, putVocabBatch } from './db.js?v=30';
import { getDecryptedApiKey } from './gemini.js?v=30';
import {
  getDefaultProfile,
  applyProfileTurn,
  applyVocabularyUsage,
  getOverdueVocabulary,
} from './pedagogy.js?v=30';
import { advanceIdle } from './learning.js?v=30';

const LANG = 'en';
const MODEL = 'models/gemini-3.8-live';
const WS_PATH =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const VOICE = 'Aoede';
const INPUT_RATE = 16000;
const OUTPUT_RATE = 24000;
const MAX_MIC_DENIALS = 3;
const IDEMPOTENT_MS = 3000;

const SITUATIONS = {
  coffee: {
    title: 'Un café',
    situation:
      'Sit in a café and talk in English about ordering a drink, staying a while, and the people around the table. British and American words both fit.',
  },
  weekend: {
    title: 'El fin de semana',
    situation: 'Talk in English about a recent weekend and a plan for the next one. Follow the details the learner offers.',
  },
  shopping: {
    title: 'De compras',
    situation:
      'Shop together in English: fruit, prices, quantities, and asking for a recommendation. Stay inside what the learner wants to buy.',
  },
  travel: {
    title: 'Un viaje',
    situation:
      'Plan a trip in English. Let the learner choose the place. Talk about the journey and what they hope to do. Do not invent live timetables.',
  },
  today: {
    title: 'El mundo de hoy',
    situation:
      'Ask which current topic they want. Discuss only facts from a recent web search. If no sources came back, say so and stay with their opinion.',
  },
  psychology: {
    title: 'Psicología',
    situation:
      'Talk in English about psychology in everyday life: emotions, habits, stress, motivation, and how we think. Keep it conversational and practical. Do not give clinical diagnoses or therapy. If the topic turns sensitive, stay gentle and suggest professional help when that fits.',
  },
  free: { title: 'Libre', situation: '' },
};

const TOOL_DECLARATIONS = [
  {
    name: 'guardar_palabra',
    description:
      'Save one English lemma the learner actually used. Call only after clear evidence in their words. Never save a word just because you said it.',
    parameters: {
      type: 'OBJECT',
      properties: {
        lemma: { type: 'STRING' },
        form: { type: 'STRING' },
        quote: { type: 'STRING' },
        meaning: { type: 'STRING', description: 'Short Spanish gloss' },
        kind: {
          type: 'STRING',
          format: 'enum',
          enum: ['independent', 'assisted', 'understanding', 'lapse'],
        },
      },
      required: ['lemma', 'form', 'quote', 'meaning', 'kind'],
    },
  },
  {
    name: 'listar_palabras_pendientes',
    description: 'List up to 5 English lemmas due for reuse. Use silently; do not read the list aloud unless it fits the chat.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'actualizar_perfil_turno',
    description:
      'Update learner level after a clear turn. outcome: success|partial|uncertain|breakdown. suggestedLevel 0-5.',
    parameters: {
      type: 'OBJECT',
      properties: {
        outcome: {
          type: 'STRING',
          format: 'enum',
          enum: ['success', 'partial', 'uncertain', 'breakdown'],
        },
        suggestedLevel: { type: 'INTEGER' },
        quote: { type: 'STRING' },
        capability: { type: 'STRING' },
        nextGoal: { type: 'STRING' },
        isSpoken: { type: 'BOOLEAN' },
      },
      required: ['outcome', 'suggestedLevel'],
    },
  },
  {
    name: 'cambiar_situacion',
    description: 'Switch conversation situation. id: coffee|weekend|shopping|travel|today|psychology|free.',
    parameters: {
      type: 'OBJECT',
      properties: {
        id: { type: 'STRING' },
        title: { type: 'STRING' },
      },
      required: ['id'],
    },
  },
  {
    name: 'cerrar_sesion',
    description: 'End the live session after a short English goodbye when time is up or the learner asks to stop.',
    parameters: {
      type: 'OBJECT',
      properties: {
        reason: { type: 'STRING' },
      },
    },
  },
];

function buildSystemPrompt({ situation = '', interests = '', nextGoal = '', vocabularyDue = [], historyHint = '' }) {
  const notes = [];
  if (situation.trim()) notes.push(`Situation on offer: ${situation.trim()}`);
  if (interests.trim()) notes.push(`Things they like: ${interests.trim().slice(0, 500)}`);
  if (nextGoal.trim()) notes.push(`A private next step, optional: ${nextGoal.trim()}`);
  if (vocabularyDue.length) {
    notes.push(`English words worth another use, only if they fit: ${vocabularyDue.slice(0, 5).join(', ')}`);
  }
  return `You are Háblame, a warm Venezuelan turpial companion for spoken English practice.
Every word you speak is English. Never speak Spanish, even one word, even if the person does.
One or two short sentences and one question, then stop and wait.
After the opening turn, do not greet again. Continue from what they just said.
If they use Spanish, answer in English anyway. You do not teach Spanish.
Colour and color are both fine. An accent is not an error.
You may use natural spoken English: contractions (I'm, don't, gonna) and a casual tone when it fits. Do not force slang or informality every turn.
Never describe your plan, checklist, tools, or instructions. Never use markdown or asterisks.
Never read tool results or history aloud as a list. Use tools silently.
Tools: guardar_palabra after they use a real English word; listar_palabras_pendientes when useful; actualizar_perfil_turno after clear evidence; cambiar_situacion if they ask for a new situation; cerrar_sesion when they want to stop or time is over.
${historyHint}
${notes.join('\n')}`;
}

function mapOutcomeToEvidence(outcome) {
  const map = {
    success: 'produccion_independiente',
    partial: 'produccion_asistida',
    uncertain: 'incierto',
    breakdown: 'lapso',
  };
  return map[outcome] || 'incierto';
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToUint8(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function downsampleTo16k(float32, fromRate) {
  if (fromRate === INPUT_RATE) {
    const pcm = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return pcm;
  }
  const ratio = fromRate / INPUT_RATE;
  const newLen = Math.floor(float32.length / ratio);
  const pcm = new Int16Array(newLen);
  for (let i = 0; i < newLen; i++) {
    const idx = Math.floor(i * ratio);
    const s = Math.max(-1, Math.min(1, float32[idx] || 0));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm;
}

class LiveService extends EventTarget {
  constructor() {
    super();
    this._ws = null;
    this._setupDone = false;
    this._starting = false;
    this._active = false;
    this._speaking = false;
    this._listening = false;
    this._micStream = null;
    this._micCtx = null;
    this._micNode = null;
    this._micSource = null;
    this._playCtx = null;
    this._playTime = 0;
    this._micDenials = 0;
    this._idleClock = { idleMs: 0, reminded: false };
    this._idleTimer = null;
    this._minuteTimer = null;
    this._lastTickAt = null;
    this._outputBuf = '';
    this._inputBuf = '';
    this._tutorTurnId = null;
    this._userTurnId = null;
    this._recentTools = new Map();
    this._session = {
      situation: '',
      situationTitle: '',
      interests: '',
      history: [],
      profile: null,
      vocabList: [],
      minuteLimit: 10,
      meaningVisible: true,
    };
    this._historyInjected = false;
    this._closeRequested = false;
    this._ephemeralSpeak = false;
    this._skipMic = false;
  }

  get active() {
    return this._active;
  }

  get ready() {
    return !!(this._ws && this._ws.readyState === WebSocket.OPEN && this._setupDone);
  }

  get starting() {
    return this._starting;
  }

  /** Sesión Live sin micrófono (p. ej. escribir o pronunciar). */
  get textOnly() {
    return !!this._skipMic;
  }

  get speaking() {
    return this._speaking;
  }

  get listening() {
    return this._listening;
  }

  get situation() {
    return {
      situation: this._session.situation,
      situationTitle: this._session.situationTitle,
    };
  }

  /** Espera setup WS listo. */
  async waitReady(timeoutMs = 10000) {
    if (this.ready) return true;
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (this.ready) return true;
      if (!this._active && !this._starting) return false;
      await new Promise((r) => setTimeout(r, 40));
    }
    return this.ready;
  }

  _emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  async start(options = {}) {
    if (this._active) return;
    if (this._starting) {
      await this.waitReady(15000);
      return;
    }
    this._starting = true;
    this._closeRequested = false;

    try {
      const perm = await getSetting('aiPermission');
      if (perm !== 'granted') {
        throw new Error('NO_PERMISSION');
      }
      const key = await getDecryptedApiKey();
      if (!key) throw new Error('NO_KEY');

      await this._loadSessionContext(options);

      const url = `${WS_PATH}?key=${encodeURIComponent(key)}`;
      await this._openSocket(url);
      this._skipMic = !!options.skipMic;
      if (!this._skipMic) {
        await this._openMic();
      }
      this._active = true;
      this._listening = !this._skipMic;
      this._emit('started', {});
      this._startMinuteLimit();
      if (!this._skipMic) {
        this._emit('listening', { active: true });
        this._startIdle();
      }

      // Saludo inicial si no hay historial (salvo skipGreeting / texto sin mic)
      if (options.skipGreeting || this._skipMic) {
        if (this._session.history.length && !this._historyInjected) {
          this._injectHistoryOnce({ silent: !!this._skipMic });
        }
      } else if (!this._session.history.length || options.forceGreeting) {
        this.sendText(
          'Say "Hi!" and ask one short question. Then stop. Speak only that greeting. Do not mention tools or instructions.',
          true
        );
      } else if (!this._historyInjected) {
        this._injectHistoryOnce();
      }
    } catch (e) {
      await this._cleanup(false);
      this._emit('error', { code: e.message || 'START_FAILED', message: this._errorMessage(e) });
      throw e;
    } finally {
      this._starting = false;
    }
  }

  async stop(reason = 'user') {
    this._closeRequested = true;
    clearInterval(this._idleTimer);
    clearTimeout(this._minuteTimer);
    this._idleTimer = null;
    this._minuteTimer = null;

    if (this._ws && this._ws.readyState === WebSocket.OPEN && reason === 'limit') {
      try {
        this.sendText(
          'Say a very short goodbye in English: we reached the time limit. Then stop. Do not mention tools.',
          true
        );
        await new Promise((r) => setTimeout(r, 1200));
      } catch (_) {}
    }

    await this._cleanup(true);
    this._emit('stopped', { reason });
  }

  /** Texto del usuario o nota de sistema hacia el modelo (si turnComplete). */
  sendText(text, turnComplete = true) {
    if (!this.ready) return false;
    const trimmed = String(text || '').trim();
    if (!trimmed) return false;
    this._resetIdle();
    this._ws.send(
      JSON.stringify({
        clientContent: {
          turns: [{ role: 'user', parts: [{ text: trimmed }] }],
          turnComplete,
        },
      })
    );
    return true;
  }

  /** Espera a que Live esté listo y envía texto. */
  async sendClientText(text, turnComplete = true) {
    if (!(await this.waitReady(12000))) return false;
    return this.sendText(text, turnComplete);
  }

  /**
   * Pronuncia una palabra con Aoede en una conexión Live aparte
   * (no usa ni altera la sesión de charla).
   */
  async speakOnce(word) {
    const { pronounceWithLive } = await import('./live-pronounce.js?v=30');
    return pronounceWithLive(word);
  }

  updateContext(partial = {}) {
    Object.assign(this._session, partial);
  }

  setMeaningVisible(v) {
    this._session.meaningVisible = !!v;
  }

  async _loadSessionContext(options) {
    const [profile, vocab, interests, minuteLimit] = await Promise.all([
      getProfile(LANG),
      getAllVocabulary(LANG),
      getSetting('interests'),
      getSetting('minuteLimit'),
    ]);
    this._session.profile = profile ?? getDefaultProfile(LANG);
    this._session.vocabList = vocab || [];
    this._session.interests = interests ?? '';
    this._session.minuteLimit = minuteLimit ?? 10;
    if (options.situation != null) this._session.situation = options.situation;
    if (options.situationTitle != null) this._session.situationTitle = options.situationTitle;
    if (Array.isArray(options.history)) this._session.history = options.history;
    this._historyInjected = false;
  }

  _openSocket(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this._ws = ws;
      let settled = false;

      const fail = (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      };

      ws.onopen = () => {
        const overdue = getOverdueVocabulary(this._session.vocabList, 5).map((v) => v.lemma);
        const setup = {
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
            systemInstruction: {
              parts: [
                {
                  text: buildSystemPrompt({
                    situation: this._session.situation,
                    interests: this._session.interests,
                    nextGoal: this._session.profile?.nextTeachingGoal ?? '',
                    vocabularyDue: overdue,
                  }),
                },
              ],
            },
            tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
        };
        ws.send(JSON.stringify(setup));
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
          this._setupDone = true;
          if (!settled) {
            settled = true;
            resolve();
          }
          return;
        }

        if (msg.toolCall?.functionCalls?.length) {
          await this._handleToolCalls(msg.toolCall.functionCalls);
          return;
        }

        const sc = msg.serverContent;
        if (!sc) {
          if (msg.error) {
            this._emit('error', {
              code: 'SERVER',
              message: msg.error.message || 'Error del servidor Live',
            });
          }
          return;
        }

        // Nunca mostrar part.text (razonamiento). Solo audio + transcriptions.
        if (sc.modelTurn?.parts) {
          for (const part of sc.modelTurn.parts) {
            if (part.inlineData?.data) {
              this._speaking = true;
              this._listening = false;
              this._emit('speaking', { active: true });
              this._emit('listening', { active: false });
              this._queuePlayback(part.inlineData.data);
            }
          }
        }

        if (sc.outputTranscription?.text && !this._ephemeralSpeak) {
          if (!this._tutorTurnId) this._tutorTurnId = `live_t_${Date.now()}`;
          this._outputBuf += sc.outputTranscription.text;
          this._emit('transcript', {
            role: 'tutor',
            text: sc.outputTranscription.text,
            partial: !sc.turnComplete,
            full: this._outputBuf,
            turnId: this._tutorTurnId,
          });
        } else if (sc.outputTranscription?.text && this._ephemeralSpeak) {
          this._outputBuf += sc.outputTranscription.text;
        }

        if (sc.inputTranscription?.text && !this._ephemeralSpeak) {
          if (!this._userTurnId) this._userTurnId = `live_u_${Date.now()}`;
          this._inputBuf += sc.inputTranscription.text;
          this._emit('transcript', {
            role: 'user',
            text: sc.inputTranscription.text,
            partial: true,
            full: this._inputBuf,
            turnId: this._userTurnId,
          });
          this._resetIdle();
        }

        if (sc.interrupted) {
          this._flushPlayback();
          this._speaking = false;
          this._listening = this._active && !this._skipMic;
          this._emit('speaking', { active: false });
          if (this._listening) this._emit('listening', { active: true });
        }

        // generationComplete: deja de “hablar” en UI, pero el turno se cierra solo en turnComplete
        // (si finalizamos en ambos, la vista duplica burbujas).
        if (sc.generationComplete && !sc.turnComplete) {
          this._speaking = false;
          this._listening = this._active && !this._skipMic;
          this._emit('speaking', { active: false });
          if (this._listening) this._emit('listening', { active: true });
        }

        if (sc.turnComplete) {
          const tutorText = this._outputBuf.trim();
          const userText = this._inputBuf.trim();
          const ephemeral = this._ephemeralSpeak;
          if (!ephemeral && userText) {
            const turnId = this._userTurnId || `live_u_${Date.now()}`;
            this._emit('transcript', {
              role: 'user',
              text: userText,
              partial: false,
              full: userText,
              final: true,
              turnId,
            });
            this._session.history.push({
              id: turnId,
              speaker: 'user',
              text: userText,
              timestamp: Date.now(),
            });
          }
          if (!ephemeral && tutorText) {
            const turnId = this._tutorTurnId || `live_t_${Date.now()}`;
            this._emit('transcript', {
              role: 'tutor',
              text: tutorText,
              partial: false,
              full: tutorText,
              final: true,
              turnId,
            });
            this._session.history.push({
              id: turnId,
              speaker: 'tutor',
              text: tutorText,
              timestamp: Date.now(),
            });
            this._emit('needSubtitle', { text: tutorText, turnId });
            try {
              const voiceMs = (await getSetting('voiceMs')) ?? 0;
              await setSetting('voiceMs', voiceMs + Math.max(2000, tutorText.length * 60));
            } catch (_) {}
          }
          this._outputBuf = '';
          this._inputBuf = '';
          this._tutorTurnId = null;
          this._userTurnId = null;
          this._speaking = false;
          if (ephemeral) this._ephemeralSpeak = false;
          this._listening = this._active && !this._skipMic;
          this._emit('speaking', { active: false });
          if (this._listening) this._emit('listening', { active: true });
          if (!this._skipMic) this._resetIdle();
        }
      };

      ws.onerror = () => {
        this._emit('error', { code: 'WS', message: 'No se pudo conectar con Gemini Live.' });
        fail(new Error('WS_ERROR'));
      };

      ws.onclose = (ev) => {
        this._setupDone = false;
        const reason = (ev && ev.reason) || '';
        if (!settled) {
          const err = new Error(reason ? `WS_CLOSED: ${reason}` : 'WS_CLOSED');
          err.closeReason = reason;
          fail(err);
          return;
        }
        if (this._active && !this._closeRequested) {
          this._active = false;
          this._listening = false;
          this._speaking = false;
          this._emit('stopped', { reason: 'disconnect' });
          this._emit('error', {
            code: 'DISCONNECT',
            message: reason
              ? `La conexión de voz se cortó: ${reason}`
              : 'La conexión de voz se cortó. Toca Hablar para reconectar.',
          });
        }
      };
    });
  }

  _injectHistoryOnce({ silent = false } = {}) {
    if (this._historyInjected || !this._session.history.length) return;
    const lines = this._session.history
      .slice(-16)
      .map((t) => `${t.speaker === 'tutor' ? 'Háblame' : 'Learner'}: ${t.text}`)
      .join('\n');
    const tail = silent
      ? 'Wait for the learner. Do not speak until they send a message. Do not greet again.'
      : 'Continue from here with one short English question. Do not greet again if you already greeted.';
    this.sendText(`Private context only — do not read aloud. Recent chat:\n${lines}\n${tail}`, true);
    this._historyInjected = true;
  }

  /** Activa el mic en una sesión que empezó solo con texto. */
  async enableMic() {
    if (!this._active || !this.ready) return false;
    if (!this._skipMic && this._micStream) return true;
    await this._openMic();
    this._skipMic = false;
    this._listening = true;
    this._startIdle();
    this._emit('listening', { active: true });
    return true;
  }

  async _openMic() {
    if (this._micStream) return;
    try {
      this._micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      this._micDenials = 0;
    } catch (e) {
      this._micDenials += 1;
      if (this._micDenials >= MAX_MIC_DENIALS) {
        throw new Error('MIC_DENIED');
      }
      throw new Error('MIC_DENIED');
    }

    this._micCtx = new AudioContext();
    this._micSource = this._micCtx.createMediaStreamSource(this._micStream);
    const bufferSize = 4096;
    this._micNode = this._micCtx.createScriptProcessor(bufferSize, 1, 1);
    this._micNode.onaudioprocess = (e) => {
      if (!this._active || !this._setupDone || !this._ws || this._ws.readyState !== WebSocket.OPEN) return;
      const input = e.inputBuffer.getChannelData(0);
      const pcm = downsampleTo16k(input, this._micCtx.sampleRate);
      const bytes = new Uint8Array(pcm.buffer);
      this._ws.send(
        JSON.stringify({
          realtimeInput: {
            audio: {
              data: bytesToBase64(bytes),
              mimeType: `audio/pcm;rate=${INPUT_RATE}`,
            },
          },
        })
      );
    };
    // ScriptProcessor solo dispara si está conectado al grafo; gain 0 evita eco del mic.
    const mute = this._micCtx.createGain();
    mute.gain.value = 0;
    this._micSource.connect(this._micNode);
    this._micNode.connect(mute);
    mute.connect(this._micCtx.destination);
  }

  _ensurePlayCtx() {
    if (!this._playCtx) {
      this._playCtx = new AudioContext({ sampleRate: OUTPUT_RATE });
      this._playTime = this._playCtx.currentTime;
    }
    if (this._playCtx.state === 'suspended') this._playCtx.resume();
  }

  _queuePlayback(b64) {
    this._ensurePlayCtx();
    const bytes = base64ToUint8(b64);
    const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
    const f32 = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) f32[i] = samples[i] / 0x8000;
    const buf = this._playCtx.createBuffer(1, f32.length, OUTPUT_RATE);
    buf.copyToChannel(f32, 0);
    const src = this._playCtx.createBufferSource();
    src.buffer = buf;
    src.connect(this._playCtx.destination);
    const startAt = Math.max(this._playCtx.currentTime, this._playTime);
    src.start(startAt);
    this._playTime = startAt + buf.duration;
  }

  _flushPlayback() {
    if (this._playCtx) {
      try {
        this._playCtx.close();
      } catch (_) {}
      this._playCtx = null;
      this._playTime = 0;
    }
  }

  async _handleToolCalls(calls) {
    const responses = [];
    for (const fc of calls) {
      const name = fc.name;
      const id = fc.id;
      const args = fc.args || fc.arguments || {};
      let parsed = args;
      if (typeof args === 'string') {
        try {
          parsed = JSON.parse(args);
        } catch {
          parsed = {};
        }
      }
      const result = await this._runTool(name, parsed);
      this._emit('tool', { name, args: parsed, result });
      responses.push({
        id,
        name,
        response: result,
      });
    }
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(
        JSON.stringify({
          toolResponse: {
            functionResponses: responses.map((r) => ({
              id: r.id,
              name: r.name,
              response: r.response,
            })),
          },
        })
      );
    }
  }

  _idempotentKey(name, args) {
    return `${name}:${JSON.stringify(args)}`;
  }

  async _runTool(name, args) {
    const key = this._idempotentKey(name, args);
    const prev = this._recentTools.get(key);
    if (prev && Date.now() - prev.at < IDEMPOTENT_MS) {
      return prev.result;
    }
    let result;
    try {
      switch (name) {
        case 'guardar_palabra':
          result = await this._toolGuardarPalabra(args);
          break;
        case 'listar_palabras_pendientes':
          result = await this._toolListarPendientes();
          break;
        case 'actualizar_perfil_turno':
          result = await this._toolActualizarPerfil(args);
          break;
        case 'cambiar_situacion':
          result = this._toolCambiarSituacion(args);
          break;
        case 'cerrar_sesion':
          result = { ok: true, closing: true, reason: args.reason || 'model' };
          setTimeout(() => this.stop(args.reason || 'model'), 800);
          break;
        default:
          result = { ok: false, error: `Unknown tool: ${name}` };
      }
    } catch (e) {
      result = { ok: false, error: e.message || 'tool_failed' };
    }
    this._recentTools.set(key, { at: Date.now(), result });
    return result;
  }

  async _toolGuardarPalabra(args) {
    const lemma = String(args.lemma || '').trim();
    const form = String(args.form || '').trim();
    const quote = String(args.quote || '').trim();
    const meaning = String(args.meaning || '').trim();
    const kind = String(args.kind || '').trim();
    if (!lemma || !form || !quote || !meaning) {
      return { ok: false, error: 'Missing lemma, form, quote, or meaning' };
    }
    if (!['independent', 'assisted', 'understanding', 'lapse'].includes(kind)) {
      return { ok: false, error: 'Invalid kind' };
    }
    const situation_ = this._session.situationTitle || 'general';
    this._session.vocabList = applyVocabularyUsage(
      LANG,
      this._session.vocabList,
      { lemma, heardForm: form, quote, meaning },
      kind === 'independent',
      situation_,
      kind === 'lapse'
    );
    await putVocabBatch(this._session.vocabList);
    return { ok: true, lemma };
  }

  async _toolListarPendientes() {
    const due = getOverdueVocabulary(this._session.vocabList, 5);
    return { ok: true, lemmas: due.map((v) => v.lemma) };
  }

  async _toolActualizarPerfil(args) {
    const outcome = args.outcome;
    const level = Number(args.suggestedLevel);
    if (!['success', 'partial', 'uncertain', 'breakdown'].includes(outcome)) {
      return { ok: false, error: 'Invalid outcome' };
    }
    if (!Number.isInteger(level) || level < 0 || level > 5) {
      return { ok: false, error: 'suggestedLevel must be 0-5' };
    }
    this._session.profile = applyProfileTurn(this._session.profile, {
      quote: String(args.quote || '').slice(0, 200),
      evidenceType: mapOutcomeToEvidence(outcome),
      demonstratedLevel: level,
      isSpoken: args.isSpoken !== false,
      subtitlesVisible: this._session.meaningVisible,
      newLearnerFact: String(args.capability || ''),
      nextTeachingGoal: String(args.nextGoal || ''),
      contextSituation: this._session.situationTitle || 'general',
    });
    await putProfile(this._session.profile);
    return { ok: true, currentLevel: this._session.profile.currentLevel };
  }

  _toolCambiarSituacion(args) {
    const id = String(args.id || '').trim();
    const known = SITUATIONS[id];
    if (!known && !args.title) {
      return { ok: false, error: 'Unknown situation id' };
    }
    this._session.situation = known?.situation ?? '';
    this._session.situationTitle = args.title || known?.title || id;
    this._emit('situation', {
      id,
      situation: this._session.situation,
      situationTitle: this._session.situationTitle,
    });
    return { ok: true, title: this._session.situationTitle };
  }

  _startIdle() {
    this._idleClock = { idleMs: 0, reminded: false };
    this._lastTickAt = Date.now();
    clearInterval(this._idleTimer);
    this._idleTimer = setInterval(() => {
      if (!this._active || this._speaking) {
        this._resetIdle();
        return;
      }
      const now = Date.now();
      const elapsed = now - (this._lastTickAt || now);
      this._lastTickAt = now;
      const { clock, remind, close } = advanceIdle(this._idleClock, elapsed, true);
      this._idleClock = clock;
      if (remind) {
        this.sendText(
          'The learner has been silent. Ask once, briefly, in English if they are still there, tied to your last question. Then wait.',
          true
        );
      }
      if (close) {
        this.stop('idle');
      }
    }, 1000);
  }

  _resetIdle() {
    this._idleClock = { idleMs: 0, reminded: false };
    this._lastTickAt = Date.now();
  }

  _startMinuteLimit() {
    clearTimeout(this._minuteTimer);
    const ms = (this._session.minuteLimit || 10) * 60 * 1000;
    this._minuteTimer = setTimeout(() => {
      this.stop('limit');
    }, ms);
  }

  async _cleanup(emitListeningOff) {
    this._active = false;
    this._listening = false;
    this._speaking = false;
    this._setupDone = false;
    this._ephemeralSpeak = false;
    this._skipMic = false;
    clearInterval(this._idleTimer);
    clearTimeout(this._minuteTimer);

    if (this._micNode) {
      try {
        this._micNode.disconnect();
      } catch (_) {}
      this._micNode = null;
    }
    if (this._micSource) {
      try {
        this._micSource.disconnect();
      } catch (_) {}
      this._micSource = null;
    }
    if (this._micCtx) {
      try {
        await this._micCtx.close();
      } catch (_) {}
      this._micCtx = null;
    }
    if (this._micStream) {
      this._micStream.getTracks().forEach((t) => t.stop());
      this._micStream = null;
    }
    this._flushPlayback();
    if (this._ws) {
      try {
        this._ws.close();
      } catch (_) {}
      this._ws = null;
    }
    if (emitListeningOff) {
      this._emit('listening', { active: false });
      this._emit('speaking', { active: false });
    }
  }

  _errorMessage(e) {
    const code = e?.message || '';
    if (code === 'NO_KEY') return 'Necesitas una clave de Gemini API en Ajustes.';
    if (code === 'NO_PERMISSION') return 'Activa el permiso para enviar voz a Gemini en Ajustes.';
    if (code === 'MIC_DENIED') {
      return this._micDenials >= MAX_MIC_DENIALS
        ? 'El micrófono fue rechazado varias veces. Revisa los permisos del teléfono.'
        : 'No pude acceder al micrófono.';
    }
    if (code.startsWith('WS_CLOSED')) {
      const detail = code.replace(/^WS_CLOSED:?\s*/, '');
      if (/API key|API_KEY|invalid.*key/i.test(detail)) {
        return 'La clave de API no es válida. Revísala en Ajustes.';
      }
      if (/Unknown name|Invalid JSON/i.test(detail)) {
        return 'Configuración de voz rechazada por Gemini. Inténtalo de nuevo.';
      }
      if (detail) return `No pude iniciar la voz en directo (${detail.slice(0, 120)}).`;
    }
    return 'No pude iniciar la voz en directo.';
  }
}

export const live = new LiveService();
