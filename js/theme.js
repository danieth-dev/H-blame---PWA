/**
 * theme.js — Estilos visuales Crema / Tinta
 * Persistencia: IndexedDB (fuente) + localStorage (arranque sin FOUC)
 */
import { getSetting, setSetting } from './db.js?v=30';

export const THEME_CREMA = 'crema';
export const THEME_TINTA = 'tinta';

const THEME_META = {
  crema: '#FEFAF2',
  tinta: '#18150F',
};

const LS_KEY = 'hablame_theme';

export function normalizeTheme(id) {
  return id === THEME_TINTA ? THEME_TINTA : THEME_CREMA;
}

/** Aplica el tema al documento (inmediato). */
export function applyTheme(id) {
  const theme = normalizeTheme(id);
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme === THEME_TINTA ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = THEME_META[theme];
  try {
    localStorage.setItem(LS_KEY, theme);
  } catch (_) {}
  return theme;
}

/** Lee el tema guardado (IndexedDB) y lo aplica. */
export async function loadAndApplyTheme() {
  let stored = null;
  try {
    stored = await getSetting('uiTheme');
  } catch (_) {}
  if (!stored) {
    try {
      stored = localStorage.getItem(LS_KEY);
    } catch (_) {}
  }
  return applyTheme(stored);
}

/** Guarda y aplica. */
export async function saveTheme(id) {
  const theme = applyTheme(id);
  await setSetting('uiTheme', theme);
  return theme;
}
