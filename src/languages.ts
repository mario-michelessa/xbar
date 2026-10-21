// Built-in languages. To add one permanently, append an entry here; users can
// also add their own from the language bar (stored in SQLite, see db.ts).
export type Language = {
  code: string;
  name: string; // short label for the selector
  fullName: string; // name given to the LLM
  promptNotes?: string; // extra defaults passed to the LLM
  rtl?: boolean;
  // Set for non-Latin scripts: what the LLM should put in "transliteration".
  transliteration?: string;
  custom?: boolean; // added by the user
};

export const BUILTIN_LANGUAGES: Language[] = [
  { code: 'fr', name: 'French', fullName: 'French' },
  {
    code: 'ar',
    name: 'Arabic',
    fullName: 'Modern Standard Arabic',
    promptNotes:
      'Use Modern Standard Arabic (fuṣḥā) unless the learner explicitly asks about a dialect. Include short vowel marks (tashkīl) where they help the learner.',
    rtl: true,
    transliteration: 'a readable Latin romanization of the Arabic, including the short vowels (e.g. "kayfa ḥāluka")',
  },
  {
    code: 'ta',
    name: 'Tamil',
    fullName: 'Tamil',
    transliteration: 'a readable Latin romanization (ISO 15919 style, e.g. "vaṇakkam")',
  },
  { code: 'id', name: 'Indonesian', fullName: 'Indonesian' },
  {
    code: 'zh',
    name: 'Chinese',
    fullName: 'Mandarin Chinese',
    promptNotes: 'Use Simplified Chinese characters by default.',
    transliteration: 'Hanyu Pinyin with tone marks, words separated by spaces (e.g. "nǐ hǎo")',
  },
];

let languages: Language[] = BUILTIN_LANGUAGES;

/** Built-in + user-added languages. */
export function allLanguages(): Language[] {
  return languages;
}

export function setCustomLanguages(custom: Language[]): void {
  languages = [...BUILTIN_LANGUAGES, ...custom];
}

export function getLanguage(code: string): Language {
  return languages.find((l) => l.code === code) ?? languages[0];
}
