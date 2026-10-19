/**
 * views/charla.js â€” Vista de conversaciÃ³n activa
 *
 * Reglas native-pwa aplicadas:
 *  - Gestos: long-press en <a> cancelado; scroll sin trabarse (touch-action: pan-y)
 *  - Recargar no pierde la sesiÃ³n activa (se guarda en IDB)
 *  - Sin permiso para enviar voz y texto a Gemini, el micrÃ³fono no arranca
 *  - Controles nativos ocultos (STT usa la API del navegador)
 *  - Silencio: recordatorio 15s, cierre 30s
 */
import { getProfile, putProfile, getAllVocabulary, putVocabBatch, getSetting, setSetting, saveSession } from '../db.js';
import { apiInitConversation, apiSendTurn, apiRequestHelp, apiExplainWord } from '../gemini.js?v=2';
import { getDefaultProfile, applyProfileTurn, applyVocabularyUsage, getOverdueVocabulary } from '../pedagogy.js';
import { advanceIdle, CHECK_IN_MS, IDLE_CLOSE_MS, pacingInstruction, acceptWords } from '../learning.js';

const LANG = 'en';

export async function mountCharla(container, { navigate }) {
  // â”€â”€ Estado de sesiÃ³n â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let profile        = (await getProfile(LANG)) ?? getDefaultProfile(LANG);
  let vocabList      = await getAllVocabulary(LANG);
  let history        = [];   // { id, speaker, text, subtitle, timestamp }
  let tutorLines     = [];   // { text, at }[] para acceptWords
  let situation      = '';
  let situationTitle = '';
  let pacing         = profile.pacing || 'suave';
  let meaningVisible = true;
  let sessionActive  = false;
  let idleClock      = { idleMs: 0, reminded: false };
  let lastTickAt     = null;
  let idleTimer      = null;
  let minuteTimer    = null;
  let minuteLimit    = (await getSetting('minuteLimit')) ?? 10;
  let interests      = (await getSetting('interests')) ?? '';
  let voiceMs        = (await getSetting('voiceMs')) ?? 0;
  let listening      = false;
  let recognition    = null;
  let speechSynth    = window.speechSynthesis;
  let pendingActionAfterAiGrant = null;

  // Leer si el usuario seleccionÃ³ una situaciÃ³n nueva en Temas
  let hasNewTopic = false;
  try {
    const isNew = sessionStorage.getItem('hablame_new_topic');
    if (isNew === 'true') {
      hasNewTopic = true;
      sessionStorage.removeItem('hablame_new_topic');
    }
    const raw = sessionStorage.getItem('hablame_situation');
    if (raw) {
      const obj = JSON.parse(raw);
      situation      = obj.situation ?? '';
      situationTitle = obj.title ?? '';
    }
  } catch (_) {}

  // â”€â”€ HTML â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  container.innerHTML = `
    <div class="view-charla" id="charla-root">
      <!-- Indicador de situaciÃ³n activa -->
      <div id="situation-bar" style="padding:8px 16px;font-size:0.8125rem;color:var(--muted);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0" hidden>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:0.9375rem">ðŸ“</span>
          <span id="situation-label" style="font-weight:600"></span>
        </div>
        <button id="btn-change-topic" type="button" style="font-size:0.75rem;color:var(--ink);font-weight:700;text-decoration:underline;background:none;border:none;cursor:pointer;padding:4px 0">Cambiar</button>
      </div>

      <!-- Scroll de burbujas -->
      <div class="view-charla__scroll" id="chat-scroll" role="log" aria-live="polite" aria-label="ConversaciÃ³n"></div>

      <!-- Controles -->
      <div class="view-charla__controls">
        <!-- Fila de estado (voz activa / inactiva) -->
        <div class="view-charla__row" style="justify-content:center;min-height:24px" id="status-row">
          <div id="voice-indicator" style="display:flex;align-items:center;gap:8px;color:var(--muted);font-size:0.875rem" hidden>
            <div class="voice-bars">
              <div class="voice-bar"></div>
              <div class="voice-bar"></div>
              <div class="voice-bar"></div>
            </div>
            Escuchandoâ€¦
          </div>
          <div id="thinking-indicator" hidden style="display:flex;align-items:center;gap:8px;color:var(--muted);font-size:0.875rem">
            <div class="spinner" style="width:16px;height:16px;border-width:2px"></div>
            Pensandoâ€¦
          </div>
        </div>

        <!-- Botones secundarios -->
        <div class="view-charla__row">
          <button id="btn-meaning" class="btn btn-secondary" type="button" style="flex:1;height:44px;font-size:0.875rem">
            <span id="meaning-label">Significado âœ“</span>
          </button>
          <button id="btn-help" class="btn btn-secondary" type="button" style="height:44px;font-size:0.875rem;padding:0 16px">
            Una ayuda
          </button>
        </div>

        <!-- BotÃ³n principal de voz y escritura -->
        <div class="view-charla__row">
          <button id="btn-type" class="btn btn-secondary" type="button" style="height:54px;font-size:0.875rem;padding:0 16px">
            âŒ¨ï¸ Escribir
          </button>
          <button id="btn-mic" class="btn btn-primary btn-full" type="button" style="height:54px;font-size:1.0625rem">
            ðŸŽ™ Hablar
          </button>
        </div>

        <!-- Input de texto (oculto por defecto) -->
        <div id="type-row" hidden style="margin-top:4px">
          <div style="display:flex;gap:8px">
            <input
              id="text-input"
              class="settings-input selectable"
              type="text"
              placeholder="Responde en inglÃ©s, espaÃ±ol o mezcladoâ€¦"
              aria-label="Respuesta escrita"
              style="flex:1;margin-top:0"
            />
            <button id="btn-send" class="btn btn-primary" type="button" style="height:44px;padding:0 18px;font-size:0.875rem;flex-shrink:0">Enviar</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ExplicaciÃ³n de palabra (hoja inferior) -->
    <div id="word-sheet-backdrop" class="sheet-backdrop" hidden>
      <div class="sheet" role="dialog" aria-labelledby="word-sheet-title">
        <div class="sheet__handle"></div>
        <h3 id="word-sheet-title" style="font-size:1.125rem;font-weight:700;margin-bottom:var(--sp-sm)"></h3>
        <p id="word-sheet-body" class="selectable" style="font-size:0.9375rem;line-height:1.5;color:var(--muted)"></p>
        <p id="word-sheet-example" class="selectable" style="font-size:0.875rem;font-style:italic;margin-top:8px;color:var(--ink)"></p>
        <button id="word-sheet-close" class="btn btn-secondary btn-full" type="button" style="margin-top:var(--sp-lg);height:48px">Cerrar</button>
      </div>
    </div>

    <!-- Hoja de permiso de IA (si aiPermission !== 'granted') -->
    <div id="ai-perm-backdrop" class="sheet-backdrop" hidden>
      <div class="sheet" role="dialog" aria-labelledby="ai-perm-title">
        <div class="sheet__handle"></div>
        <h3 id="ai-perm-title" style="font-size:1.125rem;font-weight:700;margin-bottom:var(--sp-sm)">Permiso para conversar</h3>
        <p style="font-size:0.9375rem;line-height:1.5;color:var(--muted);margin-bottom:var(--sp-md)">
          HÃ¡blame necesita enviar tu voz o texto a Gemini API para generar las respuestas en inglÃ©s.
        </p>
        <p style="font-size:0.8125rem;color:var(--muted);margin-bottom:var(--sp-lg)">
          Los datos se transmiten de forma segura y directa a Google Gemini usando tu clave. Puedes revocar este permiso en cualquier momento desde Ajustes.
        </p>
        <div style="display:flex;flex-direction:column;gap:var(--sp-sm)">
          <button id="btn-grant-ai" class="btn btn-primary btn-full" type="button">Permitir y continuar</button>
          <button id="btn-cancel-ai" class="btn btn-secondary btn-full" type="button">Ahora no</button>
        </div>
      </div>
    </div>
  `;

  // â”€â”€ Referencias DOM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const chatScroll     = container.querySelector('#chat-scroll');
  const btnMic         = container.querySelector('#btn-mic');
  const btnType        = container.querySelector('#btn-type');
  const btnSend        = container.querySelector('#btn-send');
  const btnMeaning     = container.querySelector('#btn-meaning');
  const btnHelp        = container.querySelector('#btn-help');
  const textInput      = container.querySelector('#text-input');
  const typeRow        = container.querySelector('#type-row');
  const voiceInd       = container.querySelector('#voice-indicator');
  const thinkInd       = container.querySelector('#thinking-indicator');
  const situationBar   = container.querySelector('#situation-bar');
  const situationLabel = container.querySelector('#situation-label');
  const btnChangeTopic = container.querySelector('#btn-change-topic');
  const wordBackdrop   = container.querySelector('#word-sheet-backdrop');
  const wordTitle      = container.querySelector('#word-sheet-title');
  const wordBody       = container.querySelector('#word-sheet-body');
  const wordExample    = container.querySelector('#word-sheet-example');
  const wordClose      = container.querySelector('#word-sheet-close');
  const aiPermBackdrop = container.querySelector('#ai-perm-backdrop');
  const btnGrantAi     = container.querySelector('#btn-grant-ai');
  const btnCancelAi    = container.querySelector('#btn-cancel-ai');

  // â”€â”€ SituaciÃ³n â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (situationTitle) {
    situationLabel.textContent = situationTitle;
    situationBar.hidden = false;
  }
  btnChangeTopic.addEventListener('click', () => navigate('/temas'));

  // â”€â”€ Significado toggle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function updateMeaningBtn() {
    container.querySelector('#meaning-label').textContent = meaningVisible ? 'Significado âœ“' : 'Significado';
  }
  btnMeaning.addEventListener('click', () => {
    meaningVisible = !meaningVisible;
    updateMeaningBtn();
    container.querySelectorAll('.bubble__subtitle').forEach((el) => {
      el.style.display = meaningVisible ? '' : 'none';
    });
  });

  // â”€â”€ Renderizado de burbujas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function renderBubbleToDOM(turn) {
    const { speaker, text, subtitle } = turn;
    const div = document.createElement('div');
    div.className = `bubble bubble--${speaker} selectable`;
    div.innerHTML = `<span class="bubble__text">${escHtml(text)}</span>`;
    if (subtitle && speaker === 'tutor') {
      const sub = document.createElement('div');
      sub.className = 'bubble__subtitle';
      sub.textContent = subtitle;
      if (!meaningVisible) sub.style.display = 'none';
      div.appendChild(sub);
    }

    // Palabras tapeables en burbuja del tutor
    if (speaker === 'tutor') {
      const textSpan = div.querySelector('.bubble__text');
      textSpan.innerHTML = text.split(/\b/).map((tok) =>
        /\w/.test(tok)
          ? `<span class="word-tap" style="cursor:pointer;border-bottom:1px dotted var(--muted)">${escHtml(tok)}</span>`
          : escHtml(tok)
      ).join('');
    }

    chatScroll.appendChild(div);
    chatScroll.scrollTop = chatScroll.scrollHeight;
    return div;
  }

  function addBubble(speaker, text, subtitle) {
    const turn = { id: `${Date.now()}`, speaker, text, subtitle, timestamp: Date.now() };
    renderBubbleToDOM(turn);
    history.push(turn);
    persistActiveSession();
    return turn;
  }

  // â”€â”€ Persistencia de SesiÃ³n Activa (Regla: Recargar no pierde estado) â”€â”€
  async function persistActiveSession() {
    try {
      await setSetting('activeSession', {
        history,
        situation,
        situationTitle,
        tutorLines,
        pacing,
        sessionActive,
        lastUpdated: Date.now(),
      });
    } catch (e) {
      console.warn('Error guardando activeSession:', e);
    }
  }

  // Tap en palabra del tutor â†’ explicaciÃ³n contextual
  chatScroll.addEventListener('click', async (e) => {
    const tok = e.target.closest('.word-tap');
    if (!tok) return;
    const word = tok.textContent.trim();
    const sentence = tok.closest('.bubble')?.querySelector('.bubble__text')?.textContent?.trim() ?? '';
    if (!word || word.length < 2) return;
    showWordLoading(word);
    try {
      const result = await apiExplainWord({ word, sentence });
      showWordSheet(result.word || word, result.contextualExplanation || '', result.exampleUsage || '');
    } catch (_) {
      showWordSheet(word, 'No pude encontrar una explicaciÃ³n ahora.', '');
    }
  });

  function showWordLoading(word) {
    wordTitle.textContent = word;
    wordBody.textContent  = 'Buscandoâ€¦';
    wordExample.textContent = '';
    wordBackdrop.hidden = false;
  }
  function showWordSheet(word, body, example) {
    wordTitle.textContent   = word;
    wordBody.textContent    = body;
    wordExample.textContent = example ? `Ejemplo: ${example}` : '';
    wordBackdrop.hidden     = false;
  }
  wordClose.addEventListener('click', () => { wordBackdrop.hidden = true; });
  wordBackdrop.addEventListener('click', (e) => { if (e.target === wordBackdrop) wordBackdrop.hidden = true; });

  // â”€â”€ TTS (Voz sÃ­ntesis) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function speak(text) {
    if (!text || !speechSynth) return;
    try {
      speechSynth.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = 'en-US';
      utt.rate = 0.92;
      speechSynth.speak(utt);
    } catch (_) {}
  }

  // â”€â”€ Idle timer (15s aviso, 30s cierre de turno) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function startIdleTracking() {
    idleClock = { idleMs: 0, reminded: false };
    lastTickAt = Date.now();
    clearInterval(idleTimer);
    idleTimer = setInterval(() => {
      const now     = Date.now();
      const elapsed = now - (lastTickAt || now);
      lastTickAt    = now;
      const { clock, remind, close } = advanceIdle(idleClock, elapsed, sessionActive);
      idleClock = clock;
      if (remind && !clock.reminded) {
        const lastTutor = [...history].reverse().find((t) => t.speaker === 'tutor');
        const reminder  = lastTutor ? `Still there? ${lastTutor.text.split('.')[0]}.` : 'Still there?';
        addBubble('tutor', reminder, 'Â¿Sigues ahÃ­?');
        speak(reminder);
      }
      if (close) {
        clearInterval(idleTimer);
        endSession();
      }
    }, 1000);
  }

  function resetIdle() {
    idleClock = { idleMs: 0, reminded: false };
    lastTickAt = Date.now();
  }

  // â”€â”€ LÃ­mite de minutos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function startMinuteTimer() {
    clearTimeout(minuteTimer);
    minuteTimer = setTimeout(() => {
      addBubble('tutor', "We've reached the time limit for today. Great work!", 'Hemos llegado al lÃ­mite de tiempo. Â¡Buen trabajo!');
      speak("We've reached the time limit for today. Great work!");
      endSession();
    }, minuteLimit * 60 * 1000);
  }

  // â”€â”€ Fin de sesiÃ³n â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function endSession() {
    sessionActive = false;
    clearInterval(idleTimer);
    clearTimeout(minuteTimer);
    stopListening();
    if (speechSynth) speechSynth.cancel();

    // Guardar en el store 'sessions' si hubo conversaciÃ³n
    if (history.length > 1) {
      await saveSession({ createdAt: Date.now(), turns: history.slice(-100) });
    }

    await persistActiveSession();

    btnMic.textContent   = 'ðŸŽ™ Nueva charla';
    btnMic.disabled      = false;
    btnHelp.disabled     = true;
    btnType.disabled     = true;
    btnMeaning.disabled  = false;
  }

  // â”€â”€ VerificaciÃ³n de Permiso IA (PRODUCT.md) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Reconocimiento de Voz (STT) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert('Tu navegador no soporta reconocimiento de voz nativo. Puedes usar el teclado para responder.');
      typeRow.hidden = false;
      textInput.focus();
      return;
    }

    try {
      recognition = new SR();
      recognition.continuous  = false;
      recognition.lang        = 'es-419'; // Reconoce inglÃ©s y espaÃ±ol mezclado
      recognition.interimResults = false;

      recognition.onstart = () => {
        listening = true;
        voiceInd.hidden = false;
        btnMic.textContent = 'â¹ Detener';
      };
      recognition.onend = () => {
        listening = false;
        voiceInd.hidden = true;
        btnMic.textContent = sessionActive ? 'ðŸŽ™ Hablar' : 'ðŸŽ™ Nueva charla';
      };
      recognition.onresult = async (e) => {
        const text = e.results[0][0].transcript.trim();
        if (!text) return;
        recognition.stop();
        await handleUserTurn(text, true);
      };
      recognition.onerror = (e) => {
        if (e.error !== 'no-speech') console.warn('STT error:', e.error);
        listening = false;
        voiceInd.hidden = true;
        btnMic.textContent = sessionActive ? 'ðŸŽ™ Hablar' : 'ðŸŽ™ Nueva charla';
      };
      recognition.start();
    } catch (e) {
      console.warn('Error arrancando STT:', e);
      listening = false;
      voiceInd.hidden = true;
    }
  }

  function stopListening() {
    if (recognition) { try { recognition.stop(); } catch (_) {} }
    listening = false;
    voiceInd.hidden = true;
    btnMic.textContent = sessionActive ? 'ðŸŽ™ Hablar' : 'ðŸŽ™ Nueva charla';
  }

  // â”€â”€ Turno del usuario â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function handleUserTurn(text, isSpoken) {
    if (!text.trim() || !sessionActive) return;
    resetIdle();
    addBubble('user', text);
    const userAt = Date.now();
    setThinking(true);

    try {
      const overdue = getOverdueVocabulary(vocabList, 5);
      const pInstr  = pacingInstruction(pacing);
      const result  = await apiSendTurn({
        situation, interests,
        nextGoal:       profile.nextTeachingGoal ?? '',
        vocabularyDue:  overdue.map((v) => v.lemma),
        history:        history.slice(-20).filter((t) => t.speaker !== 'user' || t.text !== text),
        lastUserTurn:   { text, isSpoken, subtitlesWereVisible: meaningVisible, usedHelp: false },
        currentLevel:   profile.currentLevel,
        pacing,
        pacingInstruction: pInstr,
      });

      const tutorText = stripPedagogyLeak(result.tutorSpeech || '');
      if (!tutorText) { setThinking(false); return; }

      tutorLines.push({ text: tutorText, at: Date.now() });
      addBubble('tutor', tutorText, result.subtitleTranslation ?? '');
      speak(tutorText);

      // Acumular tiempo de voz
      voiceMs += 3500;
      await setSetting('voiceMs', voiceMs);

      // Evaluar turno pedagÃ³gico
      const assessment = result.assessment;
      if (assessment?.outcome) {
        const accepted = acceptWords({
          userText: text, words: assessment.words || [],
          meaningVisible, typed: !isSpoken, userAt, tutorLines, languageId: LANG,
        });

        if (accepted.length) {
          const situation_ = situationTitle || 'general';
          let updatedVocab = [...vocabList];
          for (const w of accepted) {
            updatedVocab = applyVocabularyUsage(LANG, updatedVocab,
              { lemma: w.lemma, heardForm: w.form, quote: w.quote, meaning: w.meaning },
              w.kind === 'independent', situation_, w.kind === 'lapse'
            );
          }
          vocabList = updatedVocab;
          await putVocabBatch(vocabList);
        }

        profile = applyProfileTurn(profile, {
          quote:            text,
          evidenceType:     mapOutcomeToEvidence(assessment.outcome),
          demonstratedLevel: assessment.suggestedLevel ?? profile.currentLevel,
          isSpoken,
          subtitlesVisible: meaningVisible,
          newLearnerFact:   assessment.capability ?? '',
          nextTeachingGoal: assessment.nextGoal ?? '',
          contextSituation: situationTitle || 'general',
        });
        pacing = profile.pacing;
        await putProfile(profile);
      }
      await persistActiveSession();
    } catch (err) {
      console.error('Error en turno:', err);
      const noKey = err.message === 'NO_KEY';
      const errText = noKey
        ? 'No tengo una clave de API guardada. Ve a Ajustes y ponla.'
        : 'No pude responder en este momento. IntÃ©ntalo de nuevo.';
      addBubble('tutor', errText, '');
    } finally {
      setThinking(false);
    }
  }

  // â”€â”€ Iniciar conversaciÃ³n nueva â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function startConversation() {
    sessionActive = true;
    history = [];
    tutorLines = [];
    chatScroll.innerHTML = '';
    btnMic.disabled      = false;
    btnHelp.disabled     = false;
    btnType.disabled     = false;
    btnMeaning.disabled  = false;
    btnMic.textContent   = 'ðŸŽ™ Hablar';
    setThinking(true);

    try {
      const overdue = getOverdueVocabulary(vocabList, 5);
      const result  = await apiInitConversation({
        situation, interests,
        nextGoal:      profile.nextTeachingGoal ?? '',
        vocabularyDue: overdue.map((v) => v.lemma),
        pacing,
      });
      const tutorText = stripPedagogyLeak(result.tutorSpeech || 'Hi! How are you doing today?');
      tutorLines.push({ text: tutorText, at: Date.now() });
      addBubble('tutor', tutorText, result.subtitleTranslation ?? 'Â¡Hola!');
      speak(tutorText);
      startIdleTracking();
      startMinuteTimer();
      await persistActiveSession();
    } catch (err) {
      const noKey = err.message === 'NO_KEY';
      addBubble('tutor',
        noKey ? 'Necesito una clave de Gemini API para hablar. Ve a Ajustes.' : 'No pude iniciar la conversaciÃ³n.',
        '');
      sessionActive = false;
      btnMic.textContent = 'ðŸŽ™ Nueva charla';
    } finally {
      setThinking(false);
    }
  }

  // â”€â”€ Eventos de interacciÃ³n â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  btnMic.addEventListener('click', async () => {
    if (!sessionActive) {
      // Iniciar nueva conversaciÃ³n
      ensureAiPermission(async () => {
        await startConversation();
      });
      return;
    }
    if (listening) {
      stopListening();
      return;
    }
    ensureAiPermission(() => {
      startListening();
    });
  });

  btnType.addEventListener('click', () => {
    typeRow.hidden = !typeRow.hidden;
    if (!typeRow.hidden) textInput.focus();
  });

  btnSend.addEventListener('click', async () => {
    const text = textInput.value.trim();
    if (!text) return;
    textInput.value = '';
    typeRow.hidden = true;
    ensureAiPermission(async () => {
      await handleUserTurn(text, false);
    });
  });

  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      btnSend.click();
    }
  });

  btnHelp.addEventListener('click', async () => {
    if (!sessionActive) return;
    resetIdle();
    setThinking(true);
    try {
      const lastTutor = [...history].reverse().find((t) => t.speaker === 'tutor');
      const result = await apiRequestHelp({ lastTutorSpeech: lastTutor?.text ?? '' });
      const tutorText = stripPedagogyLeak(result.tutorSpeech || 'Here is the same idea, smaller.');
      tutorLines.push({ text: tutorText, at: Date.now() });
      addBubble('tutor', tutorText, result.subtitleTranslation ?? '');
      speak(tutorText);
      await persistActiveSession();
    } catch (err) {
      console.error('Help error:', err);
    } finally {
      setThinking(false);
    }
  });

  // â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function setThinking(active) {
    thinkInd.hidden  = !active;
    btnMic.disabled  = active;
    btnSend.disabled = active;
  }

  function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function stripPedagogyLeak(text) {
    return text
      .replace(/```(?:json)?[\s\S]*?```/gi, '')
      .replace(/```(?:json)?[\s\S]*$/gi, '')
      .replace(/\{\s*"evidence"[\s\S]*$/i, '')
      .replace(/(?:^|\s)json\s*\{[\s\S]*$/i, '')
      .trimEnd();
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

  // â”€â”€ Arranque o RestauraciÃ³n de SesiÃ³n â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const savedActive = await getSetting('activeSession');

  if (!hasNewTopic && savedActive && Array.isArray(savedActive.history) && savedActive.history.length > 0) {
    // Restaurar conversaciÃ³n previa (Recargar no pierde sesiÃ³n)
    history        = savedActive.history;
    tutorLines     = savedActive.tutorLines || [];
    pacing         = savedActive.pacing || 'suave';
    situation      = savedActive.situation || situation;
    situationTitle = savedActive.situationTitle || situationTitle;

    if (situationTitle) {
      situationLabel.textContent = situationTitle;
      situationBar.hidden = false;
    }

    chatScroll.innerHTML = '';
    for (const turn of history) {
      renderBubbleToDOM(turn);
    }

    // Si aÃºn no expirÃ³ el lÃ­mite de tiempo de inactividad prolongada (30m)
    const isRecent = Date.now() - (savedActive.lastUpdated || 0) < 30 * 60 * 1000;
    if (savedActive.sessionActive !== false && isRecent) {
      sessionActive = true;
      btnMic.textContent = 'ðŸŽ™ Hablar';
      startIdleTracking();
      startMinuteTimer();
    } else {
      sessionActive = false;
      btnMic.textContent  = 'ðŸŽ™ Nueva charla';
      btnHelp.disabled    = true;
      btnType.disabled    = true;
    }
  } else {
    // Si viene de seleccionar un nuevo tema o no habÃ­a sesiÃ³n, iniciar
    if (hasNewTopic && savedActive && savedActive.history?.length > 1) {
      await saveSession({ createdAt: Date.now(), turns: savedActive.history.slice(-100) });
    }
    await startConversation();
  }

  // Devolver funciÃ³n unmount al cambiar de ruta
  return () => {
    clearInterval(idleTimer);
    clearTimeout(minuteTimer);
    if (recognition) try { recognition.stop(); } catch (_) {}
    if (speechSynth)  speechSynth.cancel();
  };
}

