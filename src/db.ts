// SQLite schema and queries. The whole persisted data model lives here.
import * as SQLite from 'expo-sqlite';
import { BUILTIN_LANGUAGES, type Language } from './languages';
import type { PartOfSpeech } from './llm/types';

export type Sentence = {
  id: number;
  languageCode: string;
  text: string;
  translation: string;
  transliteration: string | null;
  note: string | null;
  createdAt: number;
};

// A word, expression or part of a word, optionally with the sentence it came from.
export type VocabItem = {
  id: number;
  languageCode: string;
  text: string;
  translation: string;
  transliteration: string | null;
  note: string | null;
  source: string | null;
  pos: PartOfSpeech | null;
  // Learn mode: relative chance of being shown (1 = hard / new, smaller = easier).
  weight: number;
  createdAt: number;
};

export type NewEntry = {
  text: string;
  translation: string;
  transliteration?: string;
  note?: string;
  pos?: PartOfSpeech;
};

// Fields that can be filled in later (refresh / editing).
export type EntryPatch = Partial<{ translation: string; transliteration: string; note: string; pos: PartOfSpeech }>;

const db = SQLite.openDatabaseSync('xbar.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS language (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sentence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  languageCode TEXT NOT NULL,
  text TEXT NOT NULL,
  translation TEXT NOT NULL,
  note TEXT,
  createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sentence_lang ON sentence (languageCode, createdAt);
CREATE TABLE IF NOT EXISTS vocab (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  languageCode TEXT NOT NULL,
  text TEXT NOT NULL,
  translation TEXT NOT NULL,
  transliteration TEXT,
  note TEXT,
  source TEXT,
  createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS vocab_lang ON vocab (languageCode, createdAt);
`;

async function addColumnIfMissing(table: string, column: string, type: string) {
  const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!cols.some((c) => c.name === column)) await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

let initPromise: Promise<void> | null = null;

export function initDb(): Promise<void> {
  initPromise ??= (async () => {
    await db.execAsync(SCHEMA);
    await addColumnIfMissing('sentence', 'transliteration', 'TEXT');
    await addColumnIfMissing('vocab', 'pos', 'TEXT');
    await addColumnIfMissing('vocab', 'weight', 'REAL NOT NULL DEFAULT 1');
    await addColumnIfMissing('language', 'custom', 'INTEGER NOT NULL DEFAULT 0');
    await addColumnIfMissing('language', 'rtl', 'INTEGER NOT NULL DEFAULT 0');
    await addColumnIfMissing('language', 'transliteration', 'TEXT');
    for (const l of BUILTIN_LANGUAGES) {
      await db.runAsync('INSERT OR IGNORE INTO language (code, name) VALUES (?, ?)', l.code, l.fullName);
    }
  })();
  return initPromise;
}

export async function listSentences(languageCode: string): Promise<Sentence[]> {
  await initDb();
  return db.getAllAsync<Sentence>(
    'SELECT * FROM sentence WHERE languageCode = ? ORDER BY createdAt DESC, id DESC',
    languageCode,
  );
}

export async function addSentence(languageCode: string, s: NewEntry): Promise<void> {
  await initDb();
  await db.runAsync(
    'INSERT INTO sentence (languageCode, text, translation, transliteration, note, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
    languageCode,
    s.text,
    s.translation,
    s.transliteration ?? null,
    s.note ?? null,
    Date.now(),
  );
}

export async function deleteSentence(id: number): Promise<void> {
  await initDb();
  await db.runAsync('DELETE FROM sentence WHERE id = ?', id);
}

export async function listVocab(languageCode: string): Promise<VocabItem[]> {
  await initDb();
  return db.getAllAsync<VocabItem>(
    'SELECT * FROM vocab WHERE languageCode = ? ORDER BY createdAt DESC, id DESC',
    languageCode,
  );
}

export async function addVocab(languageCode: string, v: NewEntry & { source?: string }): Promise<void> {
  await initDb();
  await db.runAsync(
    'INSERT INTO vocab (languageCode, text, translation, transliteration, note, source, pos, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    languageCode,
    v.text,
    v.translation,
    v.transliteration ?? null,
    v.note ?? null,
    v.source ?? null,
    v.pos ?? null,
    Date.now(),
  );
}

export async function deleteVocab(id: number): Promise<void> {
  await initDb();
  await db.runAsync('DELETE FROM vocab WHERE id = ?', id);
}

const PATCH_COLUMNS = ['translation', 'transliteration', 'note', 'pos'] as const;

async function patch(table: 'sentence' | 'vocab', id: number, p: EntryPatch): Promise<void> {
  const cols = PATCH_COLUMNS.filter((c) => p[c] !== undefined && (table === 'vocab' || c !== 'pos'));
  if (!cols.length) return;
  await initDb();
  await db.runAsync(
    `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
    ...cols.map((c) => p[c] as string),
    id,
  );
}

export const updateSentence = (id: number, p: EntryPatch) => patch('sentence', id, p);
export const updateVocab = (id: number, p: EntryPatch) => patch('vocab', id, p);

export async function setVocabWeight(id: number, weight: number): Promise<void> {
  await initDb();
  await db.runAsync('UPDATE vocab SET weight = ? WHERE id = ?', weight, id);
}

// --- User-added languages ---------------------------------------------------

type LanguageRow = { code: string; name: string; rtl: number; transliteration: string | null };

export async function listCustomLanguages(): Promise<Language[]> {
  await initDb();
  const rows = await db.getAllAsync<LanguageRow>('SELECT * FROM language WHERE custom = 1 ORDER BY id');
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    fullName: r.name,
    rtl: !!r.rtl,
    transliteration: r.transliteration || undefined,
    custom: true,
  }));
}

export async function addCustomLanguage(l: Language): Promise<void> {
  await initDb();
  await db.runAsync(
    'INSERT INTO language (code, name, custom, rtl, transliteration) VALUES (?, ?, 1, ?, ?)',
    l.code,
    l.name,
    l.rtl ? 1 : 0,
    l.transliteration ?? null,
  );
}

/** Removes the language from the bar; its saved sentences and vocabulary are kept. */
export async function deleteCustomLanguage(code: string): Promise<void> {
  await initDb();
  await db.runAsync('DELETE FROM language WHERE code = ? AND custom = 1', code);
}
