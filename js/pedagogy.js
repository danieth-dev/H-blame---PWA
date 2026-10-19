/**
 * pedagogy.js — Puerto de pedagogy.ts (sin TypeScript)
 * Lógica pura; sin efectos de lado, sin acceso a DB.
 */

export function getTodayDateStr(now = new Date()) {
  return now.toISOString().split('T')[0];
}

export function addDaysToDate(days, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export function getDaysDifference(d1Str, d2Str) {
  const date1 = new Date(d1Str);
  const date2 = new Date(d2Str);
  return Math.ceil(Math.abs(date2 - date1) / 86_400_000);
}

export const STAGE_INTERVALS = { 0: 1, 1: 1, 2: 4, 3: 14 };

export const STAGE_DESCRIPTIONS = {
  0: { title: 'Nueva',         hint: 'La oíste o la usaste con ayuda. Prueba a decirla con tus palabras.' },
  1: { title: 'Frágil',        hint: 'La usaste sola. La retomaremos pronto.' },
  2: { title: 'En crecimiento',hint: 'La recuperaste en días distintos. Sigue valiendo la pena retomarla.' },
  3: { title: 'Estable',       hint: 'La recuperaste entre días y contextos. La fuerza puede apagarse con el tiempo.' },
};

export const LEVEL_DESCRIPTIONS = {
  0: { title: 'Fragmentos y presentaciones',       focus: 'Saludos, presentaciones y fragmentos cortos útiles.' },
  1: { title: 'Preguntas y acuerdos cotidianos',   focus: 'Preguntas cotidianas, concordancia y presente.' },
  2: { title: 'Relatos conectados y pasado',       focus: 'Relatos sencillos conectados, hechos pasados.' },
  3: { title: 'Razones y opiniones',               focus: 'Razones, opiniones y estructuras que enlazan argumentos.' },
  4: { title: 'Matiz y registro',                  focus: 'Matiz, registro, hipótesis y variación regional.' },
  5: { title: 'Conversación flexible',             focus: 'Conversación flexible, precisa e idiomática.' },
};

export function getDefaultProfile(languageId = 'en') {
  return {
    targetLanguageId: languageId,
    currentLevel: 0,
    independentSuccessStreak: 0,
    consecutiveBlockages: 0,
    pacing: 'suave',
    rememberedFacts: [],
    nextTeachingGoal: 'Iniciar conversación tranquila con preguntas cotidianas de presente.',
    capabilities: [],
    evidenceLog: [],
  };
}

export function applyVocabularyDecay(items, today = getTodayDateStr()) {
  let changed = false;
  const next = items.map((piece) => {
    if (piece.dueDate < today && (piece.stage === 2 || piece.stage === 3)) {
      changed = true;
      const newStage = piece.stage - 1;
      return { ...piece, stage: newStage, dueDate: addDaysToDate(STAGE_INTERVALS[newStage]) };
    }
    return piece;
  });
  return { items: next, changed };
}

export function applyVocabularyUsage(
  languageId, vocabList, piece, isIndependent, contextSituation, isLapse = false,
  today = getTodayDateStr()
) {
  const normalizedLemma = piece.lemma.trim().toLowerCase();
  const existingIndex = vocabList.findIndex(
    (v) => v.lemma.trim().toLowerCase() === normalizedLemma
  );
  const updatedList = [...vocabList];

  if (existingIndex >= 0) {
    const existing = updatedList[existingIndex];
    const distinctDays = existing.distinctDays.includes(today)
      ? existing.distinctDays : [...existing.distinctDays, today];
    const contexts = existing.contexts.includes(contextSituation)
      ? existing.contexts : [...existing.contexts, contextSituation];

    let newStage = existing.stage;
    if (isLapse) {
      newStage = Math.min(newStage, 1);
    } else if (isIndependent) {
      const daysSpan = getDaysDifference(existing.firstUsedDate || today, today);
      if (distinctDays.length >= 3 && contexts.length >= 2 && daysSpan >= 7) newStage = 3;
      else if (distinctDays.length >= 2) newStage = 2;
      else newStage = Math.max(existing.stage, 1);
    }

    updatedList[existingIndex] = {
      ...existing,
      heardForm: piece.heardForm || existing.heardForm,
      quote: piece.quote || existing.quote,
      meaning: piece.meaning || existing.meaning,
      stage: newStage,
      lastUsedDate: today,
      distinctDays,
      contexts,
      dueDate: addDaysToDate(STAGE_INTERVALS[newStage]),
      hadLapse: existing.hadLapse || isLapse,
    };
    return updatedList;
  }

  const initialStage = isIndependent ? 1 : 0;
  const created = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    languageId,
    lemma: piece.lemma.trim(),
    heardForm: (piece.heardForm || '').trim(),
    quote: piece.quote.trim(),
    meaning: piece.meaning.trim(),
    stage: initialStage,
    firstUsedDate: today,
    lastUsedDate: today,
    distinctDays: [today],
    contexts: [contextSituation],
    dueDate: addDaysToDate(STAGE_INTERVALS[initialStage]),
    hadLapse: isLapse,
  };
  updatedList.unshift(created);
  return updatedList;
}

export function getOverdueVocabulary(vocabList, limit = 5, today = getTodayDateStr()) {
  return vocabList.filter((p) => p.dueDate <= today).slice(0, limit);
}

export function applyProfileTurn(profile, turn, today = getTodayDateStr()) {
  let currentLevel = profile.currentLevel;
  let streak       = profile.independentSuccessStreak;
  let blockages    = profile.consecutiveBlockages;
  let pacing       = profile.pacing;

  if (turn.evidenceType === 'produccion_independiente') {
    streak += 1;
    blockages = 0;
    if (streak >= 2 && currentLevel < 5 && turn.demonstratedLevel > currentLevel) {
      currentLevel = Math.min(5, currentLevel + 1);
      streak = 0;
    }
    if (turn.isSpoken && !turn.subtitlesVisible && turn.demonstratedLevel >= 2 && streak >= 2) {
      pacing = 'amplio';
    } else if (currentLevel >= 1 && pacing === 'suave') {
      pacing = 'natural';
    }
  } else if (turn.evidenceType === 'lapso') {
    streak = 0;
    blockages += 1;
    currentLevel = Math.max(0, currentLevel - 1);
    pacing = 'suave';
  } else {
    streak = 0;
    if (turn.subtitlesVisible || !turn.isSpoken) {
      if (pacing === 'amplio') pacing = 'natural';
    }
  }

  const rememberedFacts = [...profile.rememberedFacts];
  if (turn.newLearnerFact?.trim().length > 3) {
    const fact = turn.newLearnerFact.trim();
    if (!rememberedFacts.includes(fact)) rememberedFacts.push(fact);
  }

  let capabilities = [...(profile.capabilities || [])];
  if (turn.evidenceType === 'produccion_independiente' && turn.demonstratedLevel >= 1) {
    const capTitle = LEVEL_DESCRIPTIONS[turn.demonstratedLevel]?.focus || `Nivel ${turn.demonstratedLevel}`;
    const capIndex = capabilities.findIndex((c) => c.level === turn.demonstratedLevel);
    if (capIndex >= 0) {
      const ex = capabilities[capIndex];
      const dd = ex.distinctDays.includes(today) ? ex.distinctDays : [...ex.distinctDays, today];
      const cx = ex.contexts.includes(turn.contextSituation) ? ex.contexts : [...ex.contexts, turn.contextSituation];
      const count = ex.occurrencesCount + 1;
      capabilities[capIndex] = { ...ex, occurrencesCount: count, distinctDays: dd, contexts: cx,
        isFirm: dd.length >= 2 && cx.length >= 2 && count >= 3 };
    } else {
      capabilities.push({ id: `cap_${turn.demonstratedLevel}`, description: capTitle,
        level: turn.demonstratedLevel, occurrencesCount: 1, distinctDays: [today],
        contexts: [turn.contextSituation], isFirm: false });
    }
  }

  return {
    ...profile, currentLevel, independentSuccessStreak: streak, consecutiveBlockages: blockages,
    pacing, rememberedFacts, nextTeachingGoal: turn.nextTeachingGoal || profile.nextTeachingGoal,
    capabilities,
    evidenceLog: [
      { id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(), quote: turn.quote, type: turn.evidenceType,
        level: turn.demonstratedLevel, isSpoken: turn.isSpoken, subtitlesVisible: turn.subtitlesVisible },
      ...profile.evidenceLog.slice(0, 49),
    ],
  };
}
