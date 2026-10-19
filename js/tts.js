/**
 * tts.js — Pronunciación de una palabra en inglés.
 * Primario: speechSynthesis del navegador (rápido, sin cuota).
 * Opcional: el llamador puede intentar Live después.
 */

function pickEnglishVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  return (
    voices.find((v) => /^en-US/i.test(v.lang) && /google|natural|premium/i.test(v.name)) ||
    voices.find((v) => /^en-GB/i.test(v.lang)) ||
    voices.find((v) => /^en/i.test(v.lang)) ||
    null
  );
}

/** Espera a que el navegador cargue voces (Android a veces llega tarde). */
function whenVoicesReady() {
  return new Promise((resolve) => {
    const list = window.speechSynthesis?.getVoices?.() || [];
    if (list.length) {
      resolve(list);
      return;
    }
    const done = () => {
      window.speechSynthesis?.removeEventListener?.('voiceschanged', done);
      resolve(window.speechSynthesis?.getVoices?.() || []);
    };
    window.speechSynthesis?.addEventListener?.('voiceschanged', done);
    setTimeout(done, 800);
  });
}

/**
 * Dice una palabra en inglés con el motor del teléfono.
 * @returns {Promise<boolean>}
 */
export async function speakWordBrowser(word) {
  const w = String(word || '').trim();
  if (!w || !window.speechSynthesis) return false;

  await whenVoicesReady();
  window.speechSynthesis.cancel();

  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(w);
    u.lang = 'en-US';
    u.rate = 0.92;
    u.pitch = 1;
    const voice = pickEnglishVoice();
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang || 'en-US';
    }
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    u.onend = () => finish(true);
    u.onerror = () => finish(false);
    try {
      window.speechSynthesis.speak(u);
      // Algunos WebViews no disparan onend
      setTimeout(() => finish(true), Math.min(4000, 600 + w.length * 180));
    } catch (_) {
      finish(false);
    }
  });
}
