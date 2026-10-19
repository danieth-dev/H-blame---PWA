/**
 * router.js — Hash router
 * Reglas native-pwa:
 *  - Router por hash
 *  - Cada pantalla es un contenedor nuevo; al reemplazar HTML, reenganchar controles
 *  - Sesión y ajustes en almacenamiento; recargar no los pierde
 */
import { openDB, migrateFromLocalStorage, getSetting } from './db.js?v=21';
import { mountBienvenida } from './views/bienvenida.js?v=21';
import { mountCharla }     from './views/charla.js?v=21';
import { mountTemas }      from './views/temas.js?v=21';
import { mountPalabras }   from './views/palabras.js?v=21';
import { mountAjustes }    from './views/ajustes.js?v=21';

const ROUTES = {
  '/':         mountBienvenida,
  '/charla':   mountCharla,
  '/temas':    mountTemas,
  '/palabras': mountPalabras,
  '/ajustes':  mountAjustes,
};

const header   = document.getElementById('app-header');
const nav      = document.getElementById('bottom-nav');
const viewEl   = document.getElementById('view');
const btnSettings = document.getElementById('btn-settings');

let currentUnmount = null;

function currentRoute() {
  const hash = location.hash.replace(/^#/, '') || '/';
  return hash || '/';
}

function setNavActive(route) {
  document.querySelectorAll('#bottom-nav .nav-item').forEach((el) => {
    const r = el.dataset.route;
    const on = r === route;
    el.classList.toggle('active', on);
    if (on) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
}

export function navigate(route, replace = false) {
  const method = replace ? 'replaceState' : 'pushState';
  history[method](null, '', '#' + route);
  render(route);
}

async function render(route) {
  // Llamar unmount anterior si existe
  if (typeof currentUnmount === 'function') {
    try { currentUnmount(); } catch (_) {}
  }
  currentUnmount = null;

  const isOnboarding = route === '/';
  header.hidden = isOnboarding;
  nav.hidden    = isOnboarding;

  if (!isOnboarding) setNavActive(route);

  // Limpiar vista
  viewEl.innerHTML = '';

  const mount = ROUTES[route] ?? ROUTES['/charla'];
  currentUnmount = await mount(viewEl, { navigate }) ?? null;
}

// Botón ajustes y brandmark en header
btnSettings.addEventListener('click', () => navigate('/ajustes'));
document.querySelector('.brandmark')?.addEventListener('click', () => navigate('/charla'));

// Clicks en nav
document.getElementById('bottom-nav').addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-item');
  if (!btn) return;
  const route = btn.dataset.route;
  if (route) navigate(route);
});

// Cancelar menú de contexto (long-press nativo) excepto en texto seleccionable
document.addEventListener('contextmenu', (e) => {
  if (!e.target.closest('.selectable')) {
    e.preventDefault();
  }
}, { passive: false });

// Hashchange (botón atrás del navegador)
window.addEventListener('hashchange', () => render(currentRoute()));

// Arranque
(async () => {
  await openDB();
  await migrateFromLocalStorage();

  // Si ya hizo onboarding, ir a charla
  const done = await getSetting('onboardingDone');
  const route = done ? (currentRoute() === '/' ? '/charla' : currentRoute()) : '/';
  navigate(route, true);

  // Service worker: actualizar sin bucle de reload en el primer install
  if ('serviceWorker' in navigator) {
    let refreshing = false;
    const hadController = !!navigator.serviceWorker.controller;
    if (hadController) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        location.reload();
      });
    }
    navigator.serviceWorker
      .register('./sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        reg.update().catch(() => {});
        if (reg.waiting && hadController) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              nw.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      })
      .catch((e) => console.warn('SW no registrado:', e));
  }
})();

