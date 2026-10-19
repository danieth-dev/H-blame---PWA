/** learning.js — Puerto de learning.ts */

export const MAX_WORDS_PER_TURN   = 6;
export const WORD_REPEAT_WINDOW_MS = 90_000;
export const DAY_MS               = 86_400_000;
export const CHECK_IN_MS          = 15_000;
export const IDLE_CLOSE_MS        = 30_000;
const BAR_DAYS = [1, 1, 4, 14];

export function normalizeSpaces(text) {
  return text.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

export function containsExactFragment(userText, quote) {
  const fragment = normalizeSpaces(quote);
  if (!fragment) return false;
  return normalizeSpaces(userText).includes(fragment);
}

export function formInsideQuote(quote, form) {
  const needle = normalizeSpaces(form).toLowerCase();
  if (!needle) return false;
  return normalizeSpaces(quote).toLowerCase().includes(needle);
}

function tutorSaidForm(lines, form, userAt) {
  const needle = normalizeSpaces(form).toLowerCase();
  if (!needle) return false;
  return lines.some((line) => {
    if (line.at > userAt) return false;
    if (userAt - line.at >= WORD_REPEAT_WINDOW_MS) return false;
    return normalizeSpaces(line.text).toLowerCase().includes(needle);
  });
}

function asKind(value) {
  const valid = ['independent', 'assisted', 'understanding', 'lapse'];
  return valid.includes(value) ? value : null;
}

export function acceptWords({ userText, words, meaningVisible, typed, userAt, tutorLines, languageId = 'en' }) {
  const accepted = [];
  for (const raw of words) {
    if (accepted.length >= MAX_WORDS_PER_TURN) break;
    const lemma    = String(raw.lemma || '').trim();
    const form     = String(raw.form || raw.heardForm || '').trim();
    const quote    = String(raw.quote || '').trim();
    const meaning  = String(raw.meaning || '').trim();
    const confidence = Number(raw.confidence);
    const language = String(raw.language || '').trim();
    let kind = asKind(raw.kind);
    if (!lemma || lemma.length >= 100 || !form || !quote || !meaning || meaning.length >= 180) continue;
    if (language !== languageId) continue;
    if (!Number.isFinite(confidence) || confidence < 0.8 || confidence > 1) continue;
    if (!containsExactFragment(userText, quote)) continue;
    if (!formInsideQuote(quote, form)) continue;
    if (!kind) continue;
    if (kind === 'independent' && (meaningVisible || typed || tutorSaidForm(tutorLines, form, userAt))) {
      kind = 'assisted';
    }
    accepted.push({ lemma, form, quote, meaning, confidence, language, kind });
  }
  return accepted;
}

function dayKey(ms) {
  const date = new Date(ms);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

export function overdueLemmas(words, now = Date.now(), limit = 5) {
  return words
    .filter((w) => {
      const bars = Number.isInteger(w.bars) ? w.bars : (Number.isInteger(w.stage) ? w.stage : 0);
      const last = w.lastUsedAt ?? (w.lastUsedDate ? Date.parse(w.lastUsedDate) : null);
      if (last == null || Number.isNaN(last)) return false;
      const days = BAR_DAYS[Math.min(bars, BAR_DAYS.length - 1)] ?? 1;
      return now >= last + days * DAY_MS;
    })
    .slice(0, limit)
    .map((w) => w.lemma);
}

export function advanceIdle(clock, elapsedMs, active) {
  if (!active) return { clock, remind: false, close: false };
  const idleMs = clock.idleMs + Math.max(0, elapsedMs);
  const remind = !clock.reminded && idleMs >= CHECK_IN_MS;
  const close  = idleMs >= IDLE_CLOSE_MS;
  return { clock: { idleMs, reminded: clock.reminded || remind }, remind, close };
}

export function pacingInstruction(delivery) {
  if (delivery === 'suave') {
    return 'For the next replies only: one short sentence, familiar words, an unhurried pace, and room to answer. Stay in English. Do not read this note aloud.';
  }
  if (delivery === 'natural') {
    return 'For the next replies only: one or two short sentences, a clear pace, and one question that lets them add something. Stay in English. Do not read this note aloud.';
  }
  return 'For the next replies only: connected sentences at a conversational pace, and room for a reason or a short story. Keep the turn short. Stay in English. Do not read this note aloud.';
}
