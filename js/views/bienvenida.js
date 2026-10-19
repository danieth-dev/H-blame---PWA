/**
 * views/bienvenida.js — Pantalla de bienvenida / onboarding
 * Reglas native-pwa:
 *  - Vista dibuja; servicio decide
 *  - Recargar no pierde sesión
 *  - Controles nativos no expuestos
 */
import { setSetting, getSetting } from '../db.js';
import { encryptApiKey } from '../gemini.js';

export async function mountBienvenida(container, { navigate }) {
  container.innerHTML = `
    <div class="view-bienvenida">
      <!-- Encabezado con marca -->
      <div class="brandmark" style="padding-top: 8px">
        <img src="./assets/turpial.svg" alt="Turpial" width="40" height="40" />
        <span class="brandmark__name">Háblame</span>
      </div>

      <!-- Centro -->
      <div class="view-bienvenida__center">
        <h1>Inglés.</h1>
        <p style="font-size:0.9375rem;color:var(--muted);line-height:1.5;margin-bottom:var(--sp-lg);max-width:300px">
          Un solo inglés. El británico y el americano caben en él.<br>
          El español queda debajo, como significado.
        </p>

        <!-- Clave API -->
        <div id="key-section" style="width:100%;max-width:340px;text-align:left;margin-bottom:var(--sp-lg)">
          <label style="font-size:0.8125rem;font-weight:700;color:var(--muted);letter-spacing:.04em;text-transform:uppercase;display:block;margin-bottom:var(--sp-xs)">
            Clave de Gemini API
          </label>
          <input
            id="api-key-input"
            type="password"
            autocomplete="off"
            spellcheck="false"
            placeholder="AIza…"
            class="settings-input"
            style="margin-top:0"
            aria-label="Clave de Gemini API"
          />
          <p style="font-size:0.75rem;color:var(--muted);margin-top:6px">
            Se guarda cifrada en tu dispositivo. Nunca sale de él.
          </p>
          <p id="key-error" style="font-size:0.75rem;color:#C0392B;margin-top:4px" hidden>
            La clave no puede estar vacía.
          </p>
        </div>

        <!-- Greeting -->
        <div class="view-bienvenida__greeting">Hi!</div>
        <div class="view-bienvenida__hola">¡Hola!</div>
      </div>

      <!-- Botón de entrada -->
      <div style="width:100%;max-width:340px;margin:0 auto">
        <button id="btn-enter" class="btn btn-primary btn-full" type="button">
          Entrar a hablar
        </button>
        <p style="font-size:0.8125rem;color:var(--muted);text-align:center;margin-top:var(--sp-sm)">
          Puedes contestar en español, en inglés o mezclando los dos.
        </p>
      </div>
    </div>
  `;

  // Si ya hay clave guardada, mostrar placeholder
  const existingCipher = await getSetting('apiKey');
  const input  = container.querySelector('#api-key-input');
  const errEl  = container.querySelector('#key-error');
  const btnEnter = container.querySelector('#btn-enter');

  if (existingCipher) {
    input.placeholder = '(guardada)';
    input.value = '';
  }

  btnEnter.addEventListener('click', async () => {
    errEl.hidden = true;
    const raw = input.value.trim();

    // Si no escribió nada pero ya hay clave → continuar
    if (!raw && existingCipher) {
      await setSetting('onboardingDone', true);
      const perm = await getSetting('aiPermission');
      if (!perm) await setSetting('aiPermission', 'granted');
      navigate('/charla', true);
      return;
    }

    if (!raw) {
      errEl.hidden = false;
      input.focus();
      return;
    }

    // Guardar clave cifrada
    const cipher = await encryptApiKey(raw);
    await setSetting('apiKey', cipher);
    await setSetting('aiPermission', 'granted');
    await setSetting('onboardingDone', true);
    navigate('/charla', true);
  });
}
