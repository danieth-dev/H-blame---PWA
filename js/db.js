/**
 * db.js — Único módulo que abre IndexedDB hablame_v1
 * Reglas native-pwa:
 *  - No borrar la base para probar
 *  - Solo insertar semilla si la clave falta
 *  - No subir versión de DB si el esquema no cambió
 */

const DB_NAME = 'hablame_v1';
const DB_VER  = 1;

let _db = null;

/** Abre (o reutiliza) la conexión. */
export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      // profile: { key: 'en', ...LearnerProfile }
      if (!db.objectStoreNames.contains('profile')) {
        db.createObjectStore('profile', { keyPath: 'targetLanguageId' });
      }

      // vocabulary: { id, languageId, lemma, ... }
      if (!db.objectStoreNames.contains('vocabulary')) {
        const vs = db.createObjectStore('vocabulary', { keyPath: 'id' });
        vs.createIndex('languageId', 'languageId');
        vs.createIndex('lemma', 'lemma');
      }

      // settings: { key, value }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }

      // sessions: historial de conversaciones
      if (!db.objectStoreNames.contains('sessions')) {
        const ss = db.createObjectStore('sessions', { autoIncrement: true, keyPath: 'id' });
        ss.createIndex('createdAt', 'createdAt');
      }
    };

    req.onsuccess = (e) => {
      _db = e.target.result;
      _db.onversionchange = () => { _db.close(); _db = null; };
      resolve(_db);
    };

    req.onerror = () => reject(req.error);
  });
}

/** Lee un valor del store settings por su clave. */
export async function getSetting(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readonly');
    const req = tx.objectStore('settings').get(key);
    req.onsuccess = () => resolve(req.result?.value ?? null);
    req.onerror  = () => reject(req.error);
  });
}

/** Escribe (upsert) un valor en settings. */
export async function setSetting(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put({ key, value });
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
}

/** Carga el perfil del aprendiz (languageId = 'en'). */
export async function getProfile(languageId = 'en') {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('profile', 'readonly');
    const req = tx.objectStore('profile').get(languageId);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => reject(req.error);
  });
}

/** Guarda (upsert) el perfil. */
export async function putProfile(profile) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('profile', 'readwrite');
    tx.objectStore('profile').put(profile);
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
}

/** Devuelve todo el vocabulario para un languageId. */
export async function getAllVocabulary(languageId = 'en') {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('vocabulary', 'readonly');
    const idx = tx.objectStore('vocabulary').index('languageId');
    const req = idx.getAll(languageId);
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror   = () => reject(req.error);
  });
}

/** Upsert de una pieza de vocabulario. */
export async function putVocab(piece) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('vocabulary', 'readwrite');
    tx.objectStore('vocabulary').put(piece);
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
}

/** Upsert de varias piezas de vocabulario en una sola transacción. */
export async function putVocabBatch(pieces) {
  if (!pieces.length) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('vocabulary', 'readwrite');
    const store = tx.objectStore('vocabulary');
    for (const p of pieces) store.put(p);
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
}

/** Guarda una sesión de conversación. */
export async function saveSession(session) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sessions', 'readwrite');
    tx.objectStore('sessions').add(session);
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
}

/* ──────────────────────────────────────────────
   Migración desde localStorage (primera apertura)
   ────────────────────────────────────────────── */
export async function migrateFromLocalStorage() {
  const migrated = await getSetting('ls_migrated');
  if (migrated) return;

  try {
    const rawProfile = localStorage.getItem('tertulia_profile_en');
    const rawVocab   = localStorage.getItem('tertulia_vocab_en');

    if (rawProfile) {
      const p = JSON.parse(rawProfile);
      await putProfile(p);
      localStorage.removeItem('tertulia_profile_en');
    }
    if (rawVocab) {
      const items = JSON.parse(rawVocab);
      if (Array.isArray(items)) await putVocabBatch(items);
      localStorage.removeItem('tertulia_vocab_en');
    }
  } catch (e) {
    console.warn('Migración desde localStorage falló:', e);
  }

  await setSetting('ls_migrated', true);
}
