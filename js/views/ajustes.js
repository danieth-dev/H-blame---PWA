/**
 * views/ajustes.js — Pantalla de ajustes
 * Reglas native-pwa:
 *  - Controles custom para select / números (Android no tematiza los nativos)
 *  - Sin menú de vínculo al long-press
 *  - Permiso de IA (granted / withdrawn)
 *  - Aviso de licencia Mural (NOTICE)
 */
import { getSetting, setSetting } from '../db.js?v=18';
import { encryptApiKey } from '../gemini.js?v=18';

export async function mountAjustes(container, { navigate }) {
  container.innerHTML = `
    <div class="view-ajustes">
      <h2 style="font-size:1.125rem;font-weight:700;margin-bottom:var(--sp-lg)">Ajustes</h2>

      <!-- Clave API -->
      <div class="settings-section">
        <div class="settings-section__title">Gemini API</div>
        <div class="settings-row" style="flex-direction:column;align-items:flex-start">
          <div class="settings-row__label">Clave de API</div>
          <div class="settings-row__sub">Se guarda cifrada en tu dispositivo. Nunca sale de él.</div>
          <input
            id="key-input"
            type="password"
            autocomplete="off"
            spellcheck="false"
            placeholder="AIza…"
            class="settings-input"
            aria-label="Clave de Gemini API"
          />
          <div style="display:flex;gap:var(--sp-sm);margin-top:var(--sp-sm);width:100%">
            <button id="btn-save-key" class="btn btn-primary" type="button" style="height:44px;font-size:0.9375rem">Guardar</button>
            <button id="btn-clear-key" class="btn btn-secondary" type="button" style="height:44px;font-size:0.9375rem">Borrar</button>
          </div>
          <p id="key-msg" style="font-size:0.75rem;margin-top:6px;color:var(--muted)"></p>
        </div>
      </div>

      <!-- Permiso de IA (Voz y texto a Gemini) -->
      <div class="settings-section">
        <div class="settings-section__title">Privacidad e IA</div>
        <div class="settings-row" style="flex-direction:column;align-items:flex-start">
          <div class="settings-row__label">Permiso para enviar voz y texto</div>
          <div class="settings-row__sub">Permite que Háblame envíe tu voz y respuestas a Gemini API para conversar.</div>
          <div style="display:flex;align-items:center;gap:12px;margin-top:var(--sp-sm);width:100%">
            <div id="ai-permission-status" class="chip chip--active" style="flex-shrink:0">
              <span id="ai-status-text">Concedido</span>
            </div>
            <button id="btn-toggle-ai" class="btn btn-secondary" type="button" style="height:40px;font-size:0.875rem;padding:0 16px">
              Cambiar
            </button>
          </div>
        </div>
      </div>

      <!-- Límite de minutos (Control customizado sin input nativo) -->
      <div class="settings-section">
        <div class="settings-section__title">Sesión</div>
        <div class="settings-row" style="flex-direction:column;align-items:flex-start">
          <div class="settings-row__label">Límite de minutos por sesión</div>
          <div class="settings-row__sub">La sesión se cierra con un saludo final al cumplirse.</div>

          <!-- Segmented control custom -->
          <div class="custom-segmented" id="minute-pills" style="display:flex;gap:6px;margin-top:var(--sp-sm);width:100%;flex-wrap:wrap">
            <button type="button" class="custom-pill" data-min="5">5 min</button>
            <button type="button" class="custom-pill" data-min="10">10 min</button>
            <button type="button" class="custom-pill" data-min="15">15 min</button>
            <button type="button" class="custom-pill" data-min="20">20 min</button>
            <button type="button" class="custom-pill" data-min="30">30 min</button>
          </div>

          <!-- Stepper customizado -->
          <div style="display:flex;align-items:center;gap:12px;margin-top:var(--sp-sm)">
            <button id="btn-dec-min" type="button" class="btn-stepper" aria-label="Restar un minuto">−</button>
            <span id="custom-min-display" style="font-weight:700;font-size:1.125rem;min-width:70px;text-align:center">10 min</span>
            <button id="btn-inc-min" type="button" class="btn-stepper" aria-label="Sumar un minuto">+</button>
          </div>
        </div>
      </div>

      <!-- Intereses -->
      <div class="settings-section">
        <div class="settings-section__title">Intereses</div>
        <div class="settings-row" style="flex-direction:column;align-items:flex-start">
          <div class="settings-row__sub" style="margin-bottom:6px">
            Háblame puede tocar estos temas si encajan en la conversación.
          </div>
          <textarea
            id="interests-input"
            class="settings-input selectable"
            rows="3"
            placeholder="Fútbol, música, café, viajes…"
            aria-label="Intereses"
            style="resize:none;line-height:1.4"
          ></textarea>
          <button id="btn-save-interests" class="btn btn-primary" type="button" style="height:44px;font-size:0.9375rem;margin-top:var(--sp-sm)">Guardar intereses</button>
        </div>
      </div>

      <!-- Uso y datos -->
      <div class="settings-section">
        <div class="settings-section__title">Datos de uso</div>
        <div class="settings-row">
          <div>
            <div class="settings-row__label">Tiempo de voz</div>
            <div id="voice-ms" class="settings-row__sub">—</div>
          </div>
        </div>
        <div style="margin-top:var(--sp-md)">
          <button id="btn-clear-usage" class="btn btn-secondary" type="button" style="height:44px;font-size:0.9375rem">Borrar datos de uso</button>
        </div>
      </div>

      <!-- Licencia & Aviso Mural -->
      <div class="settings-section">
        <div class="settings-section__title">Licencia</div>
        <p style="font-size:0.8125rem;color:var(--muted);line-height:1.45;margin-bottom:8px">
          Partes de este software adaptan Mural.<br>
          Copyright &copy; 2026 Hackmamba. Licencia MIT.
        </p>
        <button id="btn-show-notice" class="btn btn-secondary" type="button" style="height:36px;font-size:0.8125rem;padding:0 14px">
          Ver aviso de licencia
        </button>
      </div>

      <!-- Versión -->
      <div style="font-size:0.75rem;color:var(--muted);text-align:center;padding:var(--sp-lg) 0">
        Háblame PWA — local-first
      </div>
    </div>

    <!-- Sheet de Aviso de Licencia -->
    <div id="notice-sheet-backdrop" class="sheet-backdrop" hidden>
      <div class="sheet" role="dialog" aria-labelledby="notice-sheet-title">
        <div class="sheet__handle"></div>
        <h3 id="notice-sheet-title" style="font-size:1.125rem;font-weight:700;margin-bottom:var(--sp-sm)">Aviso de licencia (Mural)</h3>
        <pre class="selectable" style="font-family:monospace;font-size:0.75rem;line-height:1.4;background:var(--wing);padding:12px;border-radius:12px;white-space:pre-wrap;max-height:50vh;overflow-y:auto">
Parts of this software adapt Mural.
Copyright (c) 2026 Hackmamba

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
        </pre>
        <button id="notice-sheet-close" class="btn btn-secondary btn-full" type="button" style="margin-top:var(--sp-lg);height:48px">Cerrar</button>
      </div>
    </div>
  `;

  const keyInput        = container.querySelector('#key-input');
  const keyMsg          = container.querySelector('#key-msg');
  const interestsInput  = container.querySelector('#interests-input');
  const voiceMsEl       = container.querySelector('#voice-ms');
  const aiStatusEl      = container.querySelector('#ai-permission-status');
  const aiStatusText    = container.querySelector('#ai-status-text');
  const btnToggleAi     = container.querySelector('#btn-toggle-ai');
  const minPills        = container.querySelectorAll('.custom-pill');
  const minDisplay      = container.querySelector('#custom-min-display');
  const btnDecMin       = container.querySelector('#btn-dec-min');
  const btnIncMin       = container.querySelector('#btn-inc-min');
  const noticeBackdrop  = container.querySelector('#notice-sheet-backdrop');
  const noticeClose     = container.querySelector('#notice-sheet-close');
  const btnShowNotice   = container.querySelector('#btn-show-notice');

  // Cargar valores actuales
  let [existingCipher, minuteLimit, interests, voiceMs, aiPermission] = await Promise.all([
    getSetting('apiKey'),
    getSetting('minuteLimit'),
    getSetting('interests'),
    getSetting('voiceMs'),
    getSetting('aiPermission'),
  ]);

  minuteLimit = minuteLimit ?? 10;
  aiPermission = aiPermission ?? 'withdrawn';

  if (existingCipher) {
    keyInput.placeholder = '(guardada)';
  }
  interestsInput.value = interests ?? '';
  voiceMsEl.textContent = formatVoiceTime(voiceMs ?? 0);

  // Render AI status
  function updateAiUi() {
    const isGranted = aiPermission === 'granted';
    aiStatusText.textContent = isGranted ? 'Concedido' : 'Revocado';
    aiStatusEl.className = isGranted ? 'chip chip--active' : 'chip';
    btnToggleAi.textContent = isGranted ? 'Revocar' : 'Conceder';
  }
  updateAiUi();

  btnToggleAi.addEventListener('click', async () => {
    aiPermission = aiPermission === 'granted' ? 'withdrawn' : 'granted';
    await setSetting('aiPermission', aiPermission);
    updateAiUi();
  });

  // Render minutes
  function updateMinUi(val) {
    minuteLimit = Math.max(1, Math.min(60, val));
    minDisplay.textContent = `${minuteLimit} min`;
    minPills.forEach((p) => {
      p.classList.toggle('active', parseInt(p.dataset.min, 10) === minuteLimit);
    });
  }
  updateMinUi(minuteLimit);

  minPills.forEach((p) => {
    p.addEventListener('click', async () => {
      const v = parseInt(p.dataset.min, 10);
      updateMinUi(v);
      await setSetting('minuteLimit', v);
    });
  });

  btnDecMin.addEventListener('click', async () => {
    updateMinUi(minuteLimit - 1);
    await setSetting('minuteLimit', minuteLimit);
  });

  btnIncMin.addEventListener('click', async () => {
    updateMinUi(minuteLimit + 1);
    await setSetting('minuteLimit', minuteLimit);
  });

  // Guardar clave
  container.querySelector('#btn-save-key').addEventListener('click', async () => {
    const raw = keyInput.value.trim();
    if (!raw) { keyMsg.textContent = 'Escribe la clave.'; return; }
    const cipher = await encryptApiKey(raw);
    await setSetting('apiKey', cipher);
    keyInput.value = '';
    keyInput.placeholder = '(guardada)';
    keyMsg.textContent = 'Clave guardada.';
    setTimeout(() => { keyMsg.textContent = ''; }, 2000);
  });

  // Borrar clave
  container.querySelector('#btn-clear-key').addEventListener('click', async () => {
    await setSetting('apiKey', null);
    keyInput.placeholder = 'AIza…';
    keyMsg.textContent = 'Clave borrada. Deberás ingresar una nueva.';
    setTimeout(() => { keyMsg.textContent = ''; }, 3000);
  });

  // Guardar intereses
  container.querySelector('#btn-save-interests').addEventListener('click', async () => {
    await setSetting('interests', interestsInput.value.trim());
  });

  // Borrar datos de uso
  container.querySelector('#btn-clear-usage').addEventListener('click', async () => {
    await setSetting('voiceMs', 0);
    await setSetting('searches', 0);
    voiceMsEl.textContent = formatVoiceTime(0);
  });

  // Notice modal
  btnShowNotice.addEventListener('click', () => { noticeBackdrop.hidden = false; });
  noticeClose.addEventListener('click', () => { noticeBackdrop.hidden = true; });
  noticeBackdrop.addEventListener('click', (e) => {
    if (e.target === noticeBackdrop) noticeBackdrop.hidden = true;
  });
}

function formatVoiceTime(ms) {
  const total   = Math.round((ms || 0) / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes <= 0) return `${seconds}s de voz`;
  return `${minutes} min ${seconds}s de voz`;
}
