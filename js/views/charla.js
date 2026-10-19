/**
 * views/charla.js — Vista de conversación (Gemini Live + Flash)
 *
 * Reglas native-pwa:
 *  - Vista dibuja; live.js decide (WS, mic, audio, tools)
 *  - Al cambiar de ruta no se mata la sesión Live
 *  - Recargar no pierde activeSession; Live no auto-abre el mic
 *  - En pantalla Live: solo outputTranscription (vía eventos transcript)
 */
import { getSetting, setSetting, saveSession } from '../db.js?v=29';
import { apiSendTurn, apiRequestHelp, apiExplainWord, apiSubtitle, clearExplainCache } from '../gemini.js?v=29';
import { pacingInstruction } from '../learning.js?v=29';
import { live } from '../live.js?v=29';
import { pronounceWithLive } from '../live-pronounce.js?v=29';
import { speakWordBrowser } from '../tts.js?v=29';
import { icon, btnWithIcon, setBtnIconLabel } from '../icons.js?v=29';

export async function mountCharla(container, { navigate }) {
  let history = [];
  let situation = '';
  let situationTitle = '';
  let meaningVisible = true;
  let sessionActive = false;
  let pendingActionAfterAiGrant = null;
  let interests = (await getSetting('interests')) ?? '';
  let currentTutorBubbleId = null;
  let currentUserBubbleId = null;
  const subtitleInFlight = new Set();
  const subtitleCache = new Map(); // english → spanish
  let sheetWord = '';
  let sheetSentence = '';

  let hasNewTopic = false;
  try {
    if (sessionStorage.getItem('hablame_new_topic') === 'true') {
      hasNewTopic = true;
      sessionStorage.removeItem('hablame_new_topic');
    }
    const raw = sessionStorage.getItem('hablame_situation');
    if (raw) {
      const obj = JSON.parse(raw);
      situation = obj.situation ?? '';
      situationTitle = obj.title ?? '';
    }
  } catch (_) {}

  container.innerHTML = `
    <div class="view-charla" id="charla-root">
      <div id="situation-bar" style="padding:8px 16px;font-size:0.8125rem;color:var(--muted);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0" hidden>
        <div style="display:flex;align-items:center;gap:6px">
          <span class="situation-bar__icon">${icon.pin({ size: 16 })}</span>
          <span id="situation-label" style="font-weight:600"></span>
        </div>
        <button id="btn-change-topic" type="button" style="font-size:0.75rem;color:var(--ink);font-weight:700;text-decoration:underline;background:none;border:none;cursor:pointer;padding:4px 0">Cambiar</button>
      </div>

      <div id="live-banner" class="live-banner" data-state="off" role="status" aria-live="polite">
        <span id="live-banner-dot" class="live-banner__dot"></span>
        <span id="live-banner-text">Apagado</span>
      </div>

      <div id="no-key-hint" class="live-banner live-banner--warn" hidden>
        Sin clave de API no hay voz. <button type="button" id="btn-go-settings" class="linkish">Ir a Ajustes</button>
      </div>

      <div class="view-charla__scroll" id="chat-scroll" role="log" aria-live="polite" aria-label="Conversación"></div>

      <div class="view-charla__controls">
        <div class="view-charla__row">
          <button id="btn-meaning" class="btn btn-secondary" type="button" style="flex:1;height:44px;font-size:0.875rem">
            <span id="meaning-label" class="btn__with-icon">${btnWithIcon(icon.check({ size: 16 }), 'Significado')}</span>
          </button>
          <button id="btn-help" class="btn btn-secondary" type="button" style="height:44px;font-size:0.875rem;padding:0 16px">
            Una ayuda
          </button>
        </div>

        <div class="view-charla__row">
          <button id="btn-type" class="btn btn-secondary btn--icon-label" type="button" style="height:54px;font-size:0.875rem;padding:0 16px">
            ${btnWithIcon(icon.keyboard({ size: 18 }), 'Escribir')}
          </button>
          <button id="btn-mic" class="btn btn-primary btn-full btn--icon-label" type="button" style="height:54px;font-size:1.0625rem">
            ${btnWithIcon(icon.mic({ size: 20 }), 'Hablar')}
          </button>
        </div>

        <div class="view-charla__row" style="margin-top:0">
          <button id="btn-new" class="btn btn-secondary btn-full" type="button" style="height:40px;font-size:0.8125rem">
            Nueva charla
          </button>
        </div>

        <div id="type-row" hidden style="margin-top:4px">
          <div style="display:flex;gap:8px">
            <input
              id="text-input"
              class="settings-input selectable"
              type="text"
              placeholder="Responde en inglés, español o mezclado…"
              aria-label="Respuesta escrita"
              style="flex:1;margin-top:0"
            />
            <button id="btn-send" class="btn btn-primary" type="button" style="height:44px;padding:0 18px;font-size:0.875rem;flex-shrink:0">Enviar</button>
          </div>
        </div>
      </div>
    </div>

    <div id="word-sheet-backdrop" class="sheet-backdrop" hidden>
      <div class="sheet" role="dialog" aria-labelledby="word-sheet-title">
        <div class="sheet__handle"></div>
        <div class="word-sheet__head">
          <h3 id="word-sheet-title" class="word-sheet__title"></h3>
          <button id="word-sheet-speak" class="btn-icon word-sheet__speak" type="button" aria-label="Pronunciar">
            ${icon.speaker({ size: 22 })}
          </button>
        </div>
        <p id="word-sheet-body" class="selectable word-sheet__body"></p>
        <p id="word-sheet-example" class="selectable word-sheet__example"></p>
        <button id="word-sheet-retry" class="btn btn-secondary btn-full" type="button" hidden style="margin-top:var(--sp-sm);height:44px">Reintentar explicación</button>
        <button id="word-sheet-close" class="btn btn-secondary btn-full" type="button" style="margin-top:var(--sp-lg);height:48px">Cerrar</button>
      </div>
    </div>

    <div id="ai-perm-backdrop" class="sheet-backdrop" hidden>
      <div class="sheet" role="dialog" aria-labelledby="ai-perm-title">
        <div class="sheet__handle"></div>
        <h3 id="ai-perm-title" style="font-size:1.125rem;font-weight:700;margin-bottom:var(--sp-sm)">Permiso para conversar</h3>
        <p style="font-size:0.9375rem;line-height:1.5;color:var(--muted);margin-bottom:var(--sp-md)">
          Háblame necesita enviar tu voz o texto a Gemini API para generar las respuestas en inglés.
        </p>
        <p style="font-size:0.8125rem;color:var(--muted);margin-bottom:var(--sp-lg)">
          Los datos van directo a Google Gemini con tu clave. Puedes revocar el permiso en Ajustes.
        </p>
        <div style="display:flex;flex-direction:column;gap:var(--sp-sm)">
          <button id="btn-grant-ai" class="btn btn-primary btn-full" type="button">Permitir y continuar</button>
          <button id="btn-cancel-ai" class="btn btn-secondary btn-full" type="button">Ahora no</button>
        </div>
      </div>
    </div>

    <div id="confirm-new-backdrop" class="sheet-backdrop" hidden>
      <div class="sheet" role="dialog" aria-labelledby="confirm-new-title">
        <div class="sheet__handle"></div>
        <h3 id="confirm-new-title" style="font-size:1.125rem;font-weight:700;margin-bottom:var(--sp-sm)">¿Nueva charla?</h3>
        <p style="font-size:0.9375rem;line-height:1.5;color:var(--muted);margin-bottom:var(--sp-lg)">
          Se borra solo lo visible en pantalla. Tus palabras y tu nivel se quedan.
        </p>
        <div style="display:flex;flex-direction:column;gap:var(--sp-sm)">
          <button id="btn-confirm-new" class="btn btn-primary btn-full" type="button">Empezar de nuevo</button>
          <button id="btn-cancel-new" class="btn btn-secondary btn-full" type="button">Cancelar</button>
        </div>
      </div>
    </div>
  `;

  const chatScroll = container.querySelector('#chat-scroll');
  const btnMic = container.querySelector('#btn-mic');
  const btnType = container.querySelector('#btn-type');
  const btnSend = container.querySelector('#btn-send');
  const btnMeaning = container.querySelector('#btn-meaning');
  const btnHelp = container.querySelector('#btn-help');
  const btnNew = container.querySelector('#btn-new');
  const textInput = container.querySelector('#text-input');
  const typeRow = container.querySelector('#type-row');
  const situationBar = container.querySelector('#situation-bar');
  const situationLabel = container.querySelector('#situation-label');
  const btnChangeTopic = container.querySelector('#btn-change-topic');
  const liveBanner = container.querySelector('#live-banner');
  const liveBannerText = container.querySelector('#live-banner-text');
  const noKeyHint = container.querySelector('#no-key-hint');
  const wordBackdrop = container.querySelector('#word-sheet-backdrop');
  const wordTitle = container.querySelector('#word-sheet-title');
  const wordBody = container.querySelector('#word-sheet-body');
  const wordExample = container.querySelector('#word-sheet-example');
  const wordClose = container.querySelector('#word-sheet-close');
  const wordSpeak = container.querySelector('#word-sheet-speak');
  const wordRetry = container.querySelector('#word-sheet-retry');
  const aiPermBackdrop = container.querySelector('#ai-perm-backdrop');
  const btnGrantAi = container.querySelector('#btn-grant-ai');
  const btnCancelAi = container.querySelector('#btn-cancel-ai');
  const confirmNewBackdrop = container.querySelector('#confirm-new-backdrop');
  const btnConfirmNew = container.querySelector('#btn-confirm-new');
  const btnCancelNew = container.querySelector('#btn-cancel-new');

  if (situationTitle) {
    situationLabel.textContent = situationTitle;
    situationBar.hidden = false;
  }
  btnChangeTopic.addEventListener('click', () => navigate('/temas'));
  container.querySelector('#btn-go-settings')?.addEventListener('click', () => navigate('/ajustes'));

  const hasKey = !!(await getSetting('apiKey'));
  noKeyHint.hidden = hasKey;

  function setBanner(state) {
    liveBanner.dataset.state = state === 'text' ? 'listening' : state;
    const labels = {
      off: 'Apagado',
      listening: 'Escuchando',
      speaking: 'Respondiendo',
      text: 'Texto (sin mic)',
    };
    liveBannerText.textContent = labels[state] || 'Apagado';
  }

  function syncMicButton() {
    if (live.active) {
      if (live.textOnly) {
        setBtnIconLabel(btnMic, icon.mic({ size: 20 }), 'Hablar');
      } else {
        setBtnIconLabel(btnMic, icon.stop({ size: 18 }), 'Detener');
      }
      btnHelp.disabled = false;
      btnType.disabled = false;
      sessionActive = true;
    } else {
      setBtnIconLabel(btnMic, icon.mic({ size: 20 }), 'Hablar');
      btnHelp.disabled = !history.length && !sessionActive;
      btnType.disabled = false;
    }
    if (!live.active) setBanner('off');
    else if (live.speaking) setBanner('speaking');
    else if (live.textOnly) setBanner('text');
    else setBanner('listening');
  }

  function updateMeaningBtn() {
    const el = container.querySelector('#meaning-label');
    if (!el) return;
    el.innerHTML = meaningVisible
      ? btnWithIcon(icon.check({ size: 16 }), 'Significado')
      : '<span class="btn__label">Significado</span>';
  }

  btnMeaning.addEventListener('click', () => {
    meaningVisible = !meaningVisible;
    updateMeaningBtn();
    live.setMeaningVisible(meaningVisible);
    container.querySelectorAll('.bubble__subtitle').forEach((el) => {
      el.style.display = meaningVisible ? '' : 'none';
    });
  });

  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderBubbleToDOM(turn) {
    const { speaker, text, subtitle, id } = turn;
    const div = document.createElement('div');
    div.className = `bubble bubble--${speaker} selectable`;
    div.dataset.turnId = id;
    div.innerHTML = `<span class="bubble__text">${escHtml(text)}</span>`;
    if (subtitle && speaker === 'tutor') {
      const sub = document.createElement('div');
      sub.className = 'bubble__subtitle';
      sub.textContent = subtitle;
      if (!meaningVisible) sub.style.display = 'none';
      div.appendChild(sub);
    }
    if (speaker === 'tutor' && text) {
      const textSpan = div.querySelector('.bubble__text');
      textSpan.innerHTML = text
        .split(/\b/)
        .map((tok) =>
          /\w/.test(tok)
            ? `<span class="word-tap" style="cursor:pointer;border-bottom:1px dotted var(--muted)">${escHtml(tok)}</span>`
            : escHtml(tok)
        )
        .join('');
    }
    chatScroll.appendChild(div);
    chatScroll.scrollTop = chatScroll.scrollHeight;
    return div;
  }

  function upsertBubble(speaker, text, { subtitle, id, final } = {}) {
    const turnId = id || `${Date.now()}_${speaker}`;
    let el = chatScroll.querySelector(`[data-turn-id="${turnId}"]`);
    if (!el) {
      const turn = { id: turnId, speaker, text, subtitle: subtitle || '', timestamp: Date.now() };
      renderBubbleToDOM(turn);
      if (final) {
        history.push(turn);
        persistActiveSession();
      }
      return turnId;
    }
    const textSpan = el.querySelector('.bubble__text');
    if (speaker === 'tutor') {
      textSpan.innerHTML = text
        .split(/\b/)
        .map((tok) =>
          /\w/.test(tok)
            ? `<span class="word-tap" style="cursor:pointer;border-bottom:1px dotted var(--muted)">${escHtml(tok)}</span>`
            : escHtml(tok)
        )
        .join('');
    } else {
      textSpan.textContent = text;
    }
    if (subtitle != null && speaker === 'tutor') {
      let sub = el.querySelector('.bubble__subtitle');
      if (!sub) {
        sub = document.createElement('div');
        sub.className = 'bubble__subtitle';
        el.appendChild(sub);
      }
      sub.textContent = subtitle;
      sub.style.display = meaningVisible ? '' : 'none';
    }
    chatScroll.scrollTop = chatScroll.scrollHeight;
    if (final) {
      const existing = history.find((h) => h.id === turnId);
      if (existing) {
        existing.text = text;
        if (subtitle != null) existing.subtitle = subtitle;
      } else {
        history.push({ id: turnId, speaker, text, subtitle: subtitle || '', timestamp: Date.now() });
      }
      persistActiveSession();
    }
    return turnId;
  }

  async function persistActiveSession() {
    try {
      await setSetting('activeSession', {
        history,
        situation,
        situationTitle,
        sessionActive: live.active || sessionActive,
        lastUpdated: Date.now(),
      });
    } catch (e) {
      console.warn('Error guardando activeSession:', e);
    }
  }

  async function loadWordExplain({ force = false } = {}) {
    const word = sheetWord;
    const sentence = sheetSentence;
    if (!word) return;
    wordBody.textContent = 'Buscando…';
    wordExample.textContent = '';
    wordRetry.hidden = true;
    try {
      const result = await apiExplainWord({ word, sentence, force });
      sheetWord = result.word || word;
      wordTitle.textContent = sheetWord;
      wordBody.textContent = result.contextualExplanation || '';
      wordExample.textContent = result.exampleUsage ? `Ejemplo: ${result.exampleUsage}` : '';
      wordRetry.hidden = !result.offline;
    } catch (err) {
      console.warn('Explicar palabra falló:', err?.message || err);
      wordBody.textContent =
        err?.message === 'NO_KEY'
          ? 'No tengo una clave de API. Ve a Ajustes y ponla.'
          : 'No pude explicar esa palabra ahora.';
      wordExample.textContent = '';
      wordRetry.hidden = err?.message === 'NO_KEY';
    }
  }

  chatScroll.addEventListener('click', async (e) => {
    const tok = e.target.closest('.word-tap');
    if (!tok) return;
    const word = tok.textContent.trim();
    const sentence = tok.closest('.bubble')?.querySelector('.bubble__text')?.textContent?.trim() ?? '';
    if (!word || word.length < 2) return;
    sheetWord = word;
    sheetSentence = sentence;
    wordTitle.textContent = word;
    wordSpeak.disabled = false;
    wordBackdrop.hidden = false;
    await loadWordExplain({ force: false });
  });
  wordRetry.addEventListener('click', async () => {
    clearExplainCache(sheetWord, sheetSentence);
    await loadWordExplain({ force: true });
  });
  wordSpeak.addEventListener('click', async () => {
    const word = sheetWord || wordTitle.textContent.trim();
    if (!word) return;
    ensureAiPermission(async () => {
      wordSpeak.disabled = true;
      wordSpeak.setAttribute('aria-busy', 'true');
      try {
        // 1) Live aislado (Aoede) — no toca la charla abierta
        let ok = false;
        try {
          ok = await pronounceWithLive(word);
        } catch (e) {
          console.warn('Live pronounce:', e?.message || e);
        }
        // 2) Respaldo: TTS del teléfono
        if (!ok) ok = await speakWordBrowser(word);
        if (!ok) {
          const note = document.createElement('p');
          note.className = 'word-sheet__speak-err';
          note.textContent = 'No pude pronunciar con Live. Revisa volumen o conexión.';
          wordExample.after(note);
          setTimeout(() => note.remove(), 4000);
        }
      } catch (err) {
        console.warn('Pronunciar falló:', err?.message || err);
      } finally {
        wordSpeak.disabled = false;
        wordSpeak.removeAttribute('aria-busy');
        syncMicButton();
      }
    });
  });
  wordClose.addEventListener('click', () => {
    wordBackdrop.hidden = true;
  });
  wordBackdrop.addEventListener('click', (e) => {
    if (e.target === wordBackdrop) wordBackdrop.hidden = true;
  });

  async function ensureAiPermission(action) {
    const perm = await getSetting('aiPermission');
    if (perm === 'granted') {
      action();
      return;
    }
    pendingActionAfterAiGrant = action;
    aiPermBackdrop.hidden = false;
  }

  btnGrantAi.addEventListener('click', async () => {
    aiPermBackdrop.hidden = true;
    await setSetting('aiPermission', 'granted');
    if (pendingActionAfterAiGrant) {
      const act = pendingActionAfterAiGrant;
      pendingActionAfterAiGrant = null;
      act();
    }
  });
  btnCancelAi.addEventListener('click', () => {
    aiPermBackdrop.hidden = true;
    pendingActionAfterAiGrant = null;
  });

  async function startLive({
    forceGreeting = false,
    skipGreeting = false,
    historyForLive = null,
    skipMic = false,
  } = {}) {
    const key = await getSetting('apiKey');
    if (!key) {
      noKeyHint.hidden = false;
      upsertBubble('tutor', 'Necesito una clave de Gemini API para hablar. Ve a Ajustes.', {
        id: 'sys_nokey',
        final: true,
      });
      return false;
    }
    noKeyHint.hidden = true;
    const hist = Array.isArray(historyForLive) ? historyForLive : history;
    try {
      await live.start({
        situation,
        situationTitle,
        history: hist,
        forceGreeting: skipGreeting || skipMic ? false : forceGreeting || hist.length === 0,
        skipGreeting: skipGreeting || skipMic,
        skipMic,
      });
      sessionActive = true;
      syncMicButton();
      await persistActiveSession();
      return live.ready || (await live.waitReady(8000));
    } catch (e) {
      syncMicButton();
      console.warn('startLive falló:', e?.message || e);
      return false;
    }
  }

  async function stopLive() {
    if (live.active) await live.stop('user');
    sessionActive = false;
    syncMicButton();
    await persistActiveSession();
  }

  // ── Eventos del servicio Live ─────────────────────────────────────────
  function onStarted() {
    sessionActive = true;
    syncMicButton();
  }
  function onStopped() {
    sessionActive = false;
    currentTutorBubbleId = null;
    currentUserBubbleId = null;
    syncMicButton();
    persistActiveSession();
  }
  function onListening(e) {
    if (e.detail?.active) setBanner('listening');
    else if (!live.speaking) setBanner(live.active ? 'listening' : 'off');
    syncMicButton();
  }
  function onSpeaking(e) {
    if (e.detail?.active) setBanner('speaking');
    else if (live.active) setBanner('listening');
    syncMicButton();
  }
  function normLine(s) {
    return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function onTranscript(e) {
    const { role, full, final, turnId } = e.detail || {};
    if (!full) return;
    if (role === 'tutor') {
      let id = turnId || currentTutorBubbleId;
      // Evitar burbujas duplicadas con el mismo texto consecutivo
      if (final) {
        const last = [...history].reverse().find((t) => t.speaker === 'tutor');
        if (last && normLine(last.text) === normLine(full)) {
          id = last.id;
          currentTutorBubbleId = id;
          const cached = subtitleCache.get(normLine(full));
          if (cached) {
            upsertBubble('tutor', full, { id, subtitle: cached, final: true });
          } else if (last.subtitle) {
            upsertBubble('tutor', full, { id, subtitle: last.subtitle, final: true });
          } else {
            upsertBubble('tutor', full, { id, final: true });
          }
          currentTutorBubbleId = null;
          return;
        }
      }
      if (!id) id = `live_t_${Date.now()}`;
      currentTutorBubbleId = id;
      const cached = subtitleCache.get(normLine(full));
      upsertBubble('tutor', full, {
        id,
        subtitle: cached || undefined,
        final: !!final,
      });
      if (final) currentTutorBubbleId = null;
    } else if (role === 'user') {
      if (turnId) currentUserBubbleId = turnId;
      else if (!currentUserBubbleId) currentUserBubbleId = `live_u_${Date.now()}`;
      upsertBubble('user', full, { id: currentUserBubbleId, final: !!final });
      if (final) currentUserBubbleId = null;
    }
  }
  function ensureSubtitleEl(turnId) {
    const el = chatScroll.querySelector(`[data-turn-id="${turnId}"]`);
    if (!el) return null;
    let sub = el.querySelector('.bubble__subtitle');
    if (!sub) {
      sub = document.createElement('div');
      sub.className = 'bubble__subtitle';
      el.appendChild(sub);
    }
    return sub;
  }

  async function onNeedSubtitle(e) {
    const text = e.detail?.text;
    let turnId =
      e.detail?.turnId ||
      [...history].reverse().find((t) => t.speaker === 'tutor' && t.text === text)?.id ||
      [...chatScroll.querySelectorAll('.bubble--tutor')].pop()?.dataset?.turnId;
    if (!text || !turnId) return;

    const key = normLine(text);
    // Reusar burbuja si el texto ya está (anti-duplicado)
    const last = [...history].reverse().find((t) => t.speaker === 'tutor');
    if (last && normLine(last.text) === key) turnId = last.id;

    const cached = subtitleCache.get(key);
    if (cached) {
      upsertBubble('tutor', text, { id: turnId, subtitle: cached, final: true });
      return;
    }

    if (subtitleInFlight.has(key)) return;
    subtitleInFlight.add(key);

    const sub = ensureSubtitleEl(turnId);
    if (sub && meaningVisible) {
      sub.textContent = 'Traduciendo…';
      sub.style.display = '';
      sub.dataset.pending = '1';
    }

    try {
      const { subtitleTranslation } = await apiSubtitle(text, { retries: 2 });
      if (!subtitleTranslation) {
        if (sub && meaningVisible) {
          sub.textContent = 'Sin traducción. Toca para reintentar.';
          sub.style.display = '';
          sub.dataset.pending = 'retry';
          sub.style.cursor = 'pointer';
          sub.onclick = () => {
            sub.onclick = null;
            sub.style.cursor = '';
            subtitleInFlight.delete(key);
            onNeedSubtitle({ detail: { text, turnId } });
          };
        }
        return;
      }
      subtitleCache.set(key, subtitleTranslation);
      if (!chatScroll.querySelector(`[data-turn-id="${turnId}"]`)) return;
      upsertBubble('tutor', text, { id: turnId, subtitle: subtitleTranslation, final: true });
    } catch (err) {
      console.warn('Subtítulo falló:', err?.message || err);
      if (sub && meaningVisible) {
        sub.textContent = 'Sin traducción. Toca para reintentar.';
        sub.style.display = '';
        sub.dataset.pending = 'retry';
        sub.style.cursor = 'pointer';
        sub.onclick = () => {
          sub.onclick = null;
          sub.style.cursor = '';
          subtitleInFlight.delete(key);
          onNeedSubtitle({ detail: { text, turnId } });
        };
      }
    } finally {
      subtitleInFlight.delete(key);
    }
  }
  function onError(e) {
    const msg = e.detail?.message || 'Error de voz';
    upsertBubble('tutor', msg, { id: `err_${Date.now()}`, final: true });
    if (e.detail?.code === 'NO_KEY') noKeyHint.hidden = false;
    syncMicButton();
  }
  function onSituation(e) {
    situation = e.detail?.situation ?? situation;
    situationTitle = e.detail?.situationTitle ?? situationTitle;
    if (situationTitle) {
      situationLabel.textContent = situationTitle;
      situationBar.hidden = false;
    }
    persistActiveSession();
  }

  live.addEventListener('started', onStarted);
  live.addEventListener('stopped', onStopped);
  live.addEventListener('listening', onListening);
  live.addEventListener('speaking', onSpeaking);
  live.addEventListener('transcript', onTranscript);
  live.addEventListener('needSubtitle', onNeedSubtitle);
  live.addEventListener('error', onError);
  live.addEventListener('situation', onSituation);

  btnMic.addEventListener('click', () => {
    ensureAiPermission(async () => {
      if (live.active) {
        // Sesión de solo texto → activar mic sin cortar Live
        if (live.textOnly) {
          try {
            await live.enableMic();
            syncMicButton();
            setBanner('listening');
          } catch (e) {
            console.warn('No se pudo activar el mic:', e?.message || e);
            upsertBubble('tutor', 'No pude abrir el micrófono. Revisa el permiso del navegador.', {
              id: `err_mic_${Date.now()}`,
              final: true,
            });
          }
          return;
        }
        await stopLive();
        return;
      }
      await startLive({ forceGreeting: history.length === 0 });
    });
  });

  btnType.addEventListener('click', () => {
    typeRow.hidden = !typeRow.hidden;
    if (!typeRow.hidden) textInput.focus();
  });

  function isQuotaError(err) {
    return /quota|billing|rate.?limit|resource.?exhausted|429/i.test(String(err?.message || err || ''));
  }

  async function sendTypedViaLive(text, historyBefore) {
    if (!live.active && !live.starting) {
      const ok = await startLive({
        skipGreeting: true,
        skipMic: true,
        historyForLive: historyBefore,
      });
      if (!ok) return false;
    } else if (live.starting) {
      await live.waitReady(12000);
    }
    if (!(live.active || live.ready)) return false;
    // Evitar pisar con el inject silencioso: breve pausa si acabamos de arrancar
    if (!(await live.waitReady(8000))) return false;
    await new Promise((r) => setTimeout(r, 350));
    return !!(await live.sendClientText(text, true));
  }

  async function sendTypedViaFlash(text, historyBefore) {
    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await apiSendTurn({
          situation,
          interests,
          history: (historyBefore || history).slice(-20),
          lastUserTurn: {
            text,
            isSpoken: false,
            subtitlesWereVisible: meaningVisible,
            usedHelp: false,
          },
          pacingInstruction: pacingInstruction('suave'),
        });
        const tutorText = (result.tutorSpeech || '').trim();
        if (!tutorText) throw new Error('EMPTY_REPLY');
        const turnId = `flash_${Date.now()}`;
        const key = normLine(tutorText);
        let subtitle = (result.subtitleTranslation || '').trim() || subtitleCache.get(key) || '';
        if (subtitle) subtitleCache.set(key, subtitle);
        upsertBubble('tutor', tutorText, {
          id: turnId,
          subtitle: subtitle || (meaningVisible ? 'Traduciendo…' : ''),
          final: true,
        });
        if (!subtitle && meaningVisible) {
          onNeedSubtitle({ detail: { text: tutorText, turnId } });
        }
        return true;
      } catch (err) {
        lastErr = err;
        if (err.message === 'NO_KEY' || isQuotaError(err)) break;
      }
    }
    throw lastErr || new Error('FLASH_FAILED');
  }

  async function sendTyped() {
    const text = textInput.value.trim();
    if (!text) return;
    textInput.value = '';
    typeRow.hidden = true;

    // Escribir: Live sin mic (misma cuota que Hablar). Flash solo si Live no arranca.
    ensureAiPermission(async () => {
      const historyBefore = history.slice();
      upsertBubble('user', text, { id: `typed_${Date.now()}`, final: true });
      sessionActive = true;

      try {
        if (await sendTypedViaLive(text, historyBefore)) {
          syncMicButton();
          return;
        }
      } catch (e) {
        console.warn('Live texto falló:', e?.message || e);
      }

      try {
        await sendTypedViaFlash(text, historyBefore);
      } catch (err) {
        const noKey = err?.message === 'NO_KEY';
        const quota = isQuotaError(err);
        upsertBubble(
          'tutor',
          noKey
            ? 'No tengo una clave de API guardada. Ve a Ajustes y ponla.'
            : quota
              ? 'Se acabó la cuota de texto (Flash). Pulsa Hablar: la voz en directo suele seguir disponible.'
              : 'No pude responder. Inténtalo de nuevo o pulsa Hablar.',
          { id: `err_${Date.now()}`, final: true }
        );
      }
    });
  }

  btnSend.addEventListener('click', sendTyped);
  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      btnSend.click();
    }
  });

  btnHelp.addEventListener('click', async () => {
    const lastTutor = [...history].reverse().find((t) => t.speaker === 'tutor');
    if (!lastTutor && !live.active) return;
    try {
      if (live.active) {
        live.sendText(
          'Say the last idea again in simpler English, plus one concrete example. Then wait. Do not read this note aloud.',
          true
        );
        return;
      }
      const result = await apiRequestHelp({ lastTutorSpeech: lastTutor?.text ?? '' });
      const tutorText = (result.tutorSpeech || 'Here is the same idea, smaller.').trim();
      upsertBubble('tutor', tutorText, {
        id: `help_${Date.now()}`,
        subtitle: result.subtitleTranslation || '',
        final: true,
      });
    } catch (err) {
      console.error('Help error:', err);
    }
  });

  btnNew.addEventListener('click', () => {
    confirmNewBackdrop.hidden = false;
  });
  btnCancelNew.addEventListener('click', () => {
    confirmNewBackdrop.hidden = true;
  });
  confirmNewBackdrop.addEventListener('click', (e) => {
    if (e.target === confirmNewBackdrop) confirmNewBackdrop.hidden = true;
  });
  btnConfirmNew.addEventListener('click', async () => {
    confirmNewBackdrop.hidden = true;
    if (history.length > 1) {
      await saveSession({ createdAt: Date.now(), turns: history.slice(-100) });
    }
    if (live.active) await live.stop('new_chat');
    history = [];
    chatScroll.innerHTML = '';
    currentTutorBubbleId = null;
    currentUserBubbleId = null;
    sessionActive = false;
    await setSetting('activeSession', null);
    syncMicButton();
    ensureAiPermission(async () => {
      await startLive({ forceGreeting: true });
    });
  });

  // ── Restaurar historial visible (sin auto-conectar Live) ─────────────
  const savedActive = await getSetting('activeSession');

  if (hasNewTopic && savedActive?.history?.length > 1) {
    await saveSession({ createdAt: Date.now(), turns: savedActive.history.slice(-100) });
    await setSetting('activeSession', null);
    history = [];
  } else if (!hasNewTopic && savedActive && Array.isArray(savedActive.history) && savedActive.history.length) {
    history = savedActive.history;
    situation = savedActive.situation || situation;
    situationTitle = savedActive.situationTitle || situationTitle;
    if (situationTitle) {
      situationLabel.textContent = situationTitle;
      situationBar.hidden = false;
    }
    for (const turn of history) renderBubbleToDOM(turn);
    sessionActive = !!savedActive.sessionActive;
  }

  // Si Live sigue activo (navegación interna), solo redibujar estado
  if (live.active) {
    sessionActive = true;
    const sit = live.situation;
    if (sit.situationTitle) {
      situation = sit.situation;
      situationTitle = sit.situationTitle;
      situationLabel.textContent = situationTitle;
      situationBar.hidden = false;
    }
  }

  if (hasNewTopic) {
    ensureAiPermission(async () => {
      await startLive({ forceGreeting: true });
    });
  }

  syncMicButton();
  live.setMeaningVisible(meaningVisible);

  // Unmount: NO matar Live; solo desuscribir
  return () => {
    live.removeEventListener('started', onStarted);
    live.removeEventListener('stopped', onStopped);
    live.removeEventListener('listening', onListening);
    live.removeEventListener('speaking', onSpeaking);
    live.removeEventListener('transcript', onTranscript);
    live.removeEventListener('needSubtitle', onNeedSubtitle);
    live.removeEventListener('error', onError);
    live.removeEventListener('situation', onSituation);
    wordBackdrop.hidden = true;
    aiPermBackdrop.hidden = true;
    confirmNewBackdrop.hidden = true;
  };
}
