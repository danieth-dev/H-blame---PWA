/**
 * icons.js — Iconos SVG de trazo único (ink / currentColor).
 * Sin emoji. ViewBox 24, stroke 2, caps/joins redondos.
 */

function svg(paths, { size = 20, label = '' } = {}) {
  const aria = label ? ` role="img" aria-label="${label}"` : ' aria-hidden="true"';
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${aria}>${paths}</svg>`;
}

export const icon = {
  mic: (o) =>
    svg(
      '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 11a7 7 0 0 1-14 0"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/>',
      o
    ),
  stop: (o) => svg('<rect x="6" y="6" width="12" height="12" rx="2"/>', o),
  keyboard: (o) =>
    svg(
      '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/>',
      o
    ),
  pin: (o) =>
    svg(
      '<path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
      o
    ),
  check: (o) => svg('<path d="M5 12.5 10 17l9-11"/>', o),
  book: (o) =>
    svg(
      '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>',
      o
    ),
  cup: (o) =>
    svg(
      '<path d="M4 9h12v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9z"/><path d="M16 11h2.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8 3v2M12 3v2"/>',
      o
    ),
  sun: (o) =>
    svg(
      '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
      o
    ),
  bag: (o) =>
    svg(
      '<path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
      o
    ),
  train: (o) =>
    svg(
      '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 12h14M9 17l-2 3M15 17l2 3"/><circle cx="9" cy="15" r="1"/><circle cx="15" cy="15" r="1"/>',
      o
    ),
  news: (o) =>
    svg(
      '<path d="M4 5h12a2 2 0 0 1 2 2v12H6a2 2 0 0 1-2-2V5z"/><path d="M18 7h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2"/><path d="M8 9h6M8 13h6M8 17h3"/>',
      o
    ),
  chat: (o) =>
    svg(
      '<path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/>',
      o
    ),
  speaker: (o) =>
    svg(
      '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>',
      o
    ),
};

/** Botón con icono + etiqueta (actualizable). */
export function btnWithIcon(iconHtml, label) {
  return `<span class="btn__icon" aria-hidden="true">${iconHtml}</span><span class="btn__label">${label}</span>`;
}

export function setBtnIconLabel(btn, iconHtml, label) {
  if (!btn) return;
  btn.innerHTML = btnWithIcon(iconHtml, label);
}
