/**
 * views/temas.js — Selector de situación
 */
import { icon } from '../icons.js?v=26';
import { THEME_TINTA, normalizeTheme } from '../theme.js?v=26';

const THEMES = [
  {
    id: 'coffee',
    title: 'Un café',
    subtitle: 'Pedir, quedarse, charlar',
    icon: icon.cup({ size: 26 }),
    color: '#FFF0E8',
    colorTinta: '#3A2A24',
    situation:
      'Sit in a café and talk in English about ordering a drink, staying a while, and the people around the table. British and American words both fit.',
  },
  {
    id: 'weekend',
    title: 'El fin de semana',
    subtitle: 'Qué hiciste y qué viene',
    icon: icon.sun({ size: 26 }),
    color: '#F2EEF8',
    colorTinta: '#2C2838',
    situation: 'Talk in English about a recent weekend and a plan for the next one. Follow the details the learner offers.',
  },
  {
    id: 'shopping',
    title: 'De compras',
    subtitle: 'Precio, cantidad, preferencia',
    icon: icon.bag({ size: 26 }),
    color: '#EAF4EC',
    colorTinta: '#243028',
    situation:
      'Shop together in English: fruit, prices, quantities, and asking for a recommendation. Stay inside what the learner wants to buy.',
  },
  {
    id: 'travel',
    title: 'Un viaje',
    subtitle: 'El camino, no el horario inventado',
    icon: icon.train({ size: 26 }),
    color: '#EEF3FA',
    colorTinta: '#242C38',
    situation:
      'Plan a trip in English. Let the learner choose the place. Talk about the journey and what they hope to do. Do not invent live timetables.',
  },
  {
    id: 'today',
    title: 'El mundo de hoy',
    subtitle: 'Solo lo que la búsqueda devuelva',
    icon: icon.news({ size: 26 }),
    color: '#FFFDE8',
    colorTinta: '#322E1A',
    situation:
      'Ask which current topic they want. Discuss only facts from a recent web search. If no sources came back, say so and stay with their opinion.',
  },
  {
    id: 'free',
    title: 'Libre',
    subtitle: 'Sin situación fija',
    icon: icon.chat({ size: 26 }),
    color: '#F3F0E8',
    colorTinta: '#2A2620',
    situation: '',
  },
];

function themeCardColor(theme) {
  const mode = normalizeTheme(document.documentElement.getAttribute('data-theme'));
  return mode === THEME_TINTA ? theme.colorTinta : theme.color;
}

export async function mountTemas(container, { navigate }) {
  container.innerHTML = `
    <div class="view-temas">
      <h2 style="font-size:1.125rem;font-weight:700;margin-bottom:4px">Situaciones</h2>
      <p style="font-size:0.875rem;color:var(--muted);margin-bottom:var(--sp-md)">
        Elige de qué quieres hablar hoy.
      </p>
      <div class="view-temas__grid" id="themes-grid"></div>
    </div>
  `;

  const grid = container.querySelector('#themes-grid');

  for (const theme of THEMES) {
    const card = document.createElement('button');
    card.className = 'theme-card';
    card.style.background = themeCardColor(theme);
    card.dataset.id = theme.id;
    card.type = 'button';
    card.setAttribute('aria-label', theme.title);
    card.innerHTML = `
      <div class="theme-card__icon">${theme.icon}</div>
      <div class="theme-card__title">${theme.title}</div>
      <div class="theme-card__sub">${theme.subtitle}</div>
    `;
    card.addEventListener('click', () => {
      sessionStorage.setItem(
        'hablame_situation',
        JSON.stringify({ id: theme.id, situation: theme.situation, title: theme.title })
      );
      sessionStorage.setItem('hablame_new_topic', 'true');
      navigate('/charla');
    });
    grid.appendChild(card);
  }
}
