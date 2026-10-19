/**
 * router.js — Hash router
 * Reglas native-pwa:
 *  - Router por hash
 *  - Cada pantalla es un contenedor nuevo; al reemplazar HTML, reenganchar controles
 *  - Sesión y ajustes en almacenamiento; recargar no los pierde
 */
import { openDB, migrateFromLocalStorage, getSetting, setSetting } from './db.js';
import { mountBienvenida } from './views/bienvenida.js';
import { mountCharla }     from './views/charla.js';
import { mountTemas }      from './views/temas.js';
import { mountPalabras }   from './views/palabras.js';
import { mountAjustes }    from './views/ajustes.js';

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
const NAV_ROUTES  = ['/charla', '/temas', '/palabras'];

let currentUnmount = null;

function currentRoute() {
  const hash = location.hash.replace(/^#/, '') || '/';
  return hash || '/';
}

function setNavActive(route) {
  document.querySelectorAll('#bottom-nav .nav-item').forEach((el) => {
    const r = el.dataset.route;
    el.classList.toggle('active', r === route);
    el.setAttribute('aria-current', r === route ? 'page' : 'false');
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

  // Registrar service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((e) =>
      console.warn('SW no registrado:', e)
    );
  }
})();
