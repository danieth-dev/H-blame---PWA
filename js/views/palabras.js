/**
 * views/palabras.js — Libreta de palabras
 * Reglas native-pwa:
 *  - Controles custom (filtros por chips sin <select> nativo de Android)
 *  - Rendimiento rápido y local-first
 */
import { getAllVocabulary } from '../db.js';
import { applyVocabularyDecay } from '../pedagogy.js';
import { icon } from '../icons.js?v=12';

const STAGE_LABEL = ['Nueva', 'Frágil', 'Creciendo', 'Estable'];

export async function mountPalabras(container, { navigate }) {
  container.innerHTML = `
    <div class="view-palabras">
      <h2 style="font-size:1.125rem;font-weight:700;margin-bottom:4px">Palabras</h2>
      <p style="font-size:0.875rem;color:var(--muted);margin-bottom:var(--sp-sm)">
        Las palabras que dijiste en inglés.
      </p>

      <!-- Selector customizado de filtro por estado -->
      <div id="filter-chips" style="display:flex;gap:6px;overflow-x:auto;padding-bottom:8px;margin-bottom:var(--sp-sm);scrollbar-width:none">
        <button type="button" class="custom-pill active" data-filter="all">Todas</button>
        <button type="button" class="custom-pill" data-filter="0">Nuevas</button>
        <button type="button" class="custom-pill" data-filter="1">Frágiles</button>
        <button type="button" class="custom-pill" data-filter="2">Creciendo</button>
        <button type="button" class="custom-pill" data-filter="3">Estables</button>
      </div>

      <div id="words-loading" style="text-align:center;padding:var(--sp-xl)">
        <div class="spinner" style="margin:0 auto"></div>
      </div>
      <div id="words-list" class="word-list" hidden></div>
      <div id="words-empty" class="empty-state" hidden>
        <div class="empty-state__icon">${icon.book({ size: 36 })}</div>
        <p id="empty-msg">Aún no hay palabras guardadas.<br>Empieza a hablar y aparecerán aquí.</p>
      </div>
    </div>
  `;

  const loading     = container.querySelector('#words-loading');
  const list        = container.querySelector('#words-list');
  const empty       = container.querySelector('#words-empty');
  const emptyMsg    = container.querySelector('#empty-msg');
  const filterPills = container.querySelectorAll('#filter-chips .custom-pill');

  let allItems = [];
  let currentFilter = 'all';

  function renderList() {
    list.innerHTML = '';
    const filtered = currentFilter === 'all'
      ? allItems
      : allItems.filter((item) => String(item.stage) === currentFilter);

    if (!filtered.length) {
      list.hidden = true;
      empty.hidden = false;
      emptyMsg.innerHTML = allItems.length === 0
        ? 'Aún no hay palabras guardadas.<br>Empieza a hablar y aparecerán aquí.'
        : 'No hay palabras en esta categoría.';
      return;
    }

    empty.hidden = true;
    list.hidden  = false;

    for (const item of filtered) {
      const row = document.createElement('div');
      row.className = 'word-row';
      row.innerHTML = `
        <div style="flex:1;min-width:0">
          <div class="word-row__lemma">${escHtml(item.lemma)}</div>
          <div class="word-row__meaning">${escHtml(item.meaning)}</div>
          ${item.quote ? `<div style="font-size:0.75rem;color:var(--muted);margin-top:2px;font-style:italic">"${escHtml(item.quote)}"</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
          <span class="stage-pill stage-pill--${item.stage}">${STAGE_LABEL[item.stage] || 'Nueva'}</span>
          <div class="word-bars">
            <div class="word-bar${item.stage >= 1 ? ' lit' : ''}"></div>
            <div class="word-bar${item.stage >= 2 ? ' lit' : ''}"></div>
            <div class="word-bar${item.stage >= 3 ? ' lit' : ''}"></div>
          </div>
        </div>
      `;
      list.appendChild(row);
    }
  }

  // Filtrado al hacer click en los chips
  filterPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      filterPills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      currentFilter = pill.dataset.filter;
      renderList();
    });
  });

  try {
    const raw     = await getAllVocabulary('en');
    const decayed = applyVocabularyDecay(raw);
    allItems      = decayed.items.sort((a, b) => (b.lastUsedDate || '').localeCompare(a.lastUsedDate || ''));

    loading.hidden = true;
    renderList();
  } catch (e) {
    loading.hidden = true;
    empty.hidden = false;
    console.error('Error cargando palabras:', e);
  }
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
