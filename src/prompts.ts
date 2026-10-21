// All LLM prompt text lives here. Edit freely.
import { allLanguages, type Language } from './languages';
import { PARTS_OF_SPEECH } from './llm/types';

/**
 * What the learner is "working from": a whole sentence, or a fragment (word,
 * expression, part of a word) selected inside `source`.
 */
export type Focus = { text: string; source?: string };

function transliterationRules(): string {
  const langs = allLanguages().filter((l) => l.transliteration);
  if (!langs.length) return '';
  return `\nTransliteration — for every sentence whose "text" is in one of these languages, also fill "transliteration":
${langs.map((l) => `- ${l.fullName}: ${l.transliteration}`).join('\n')}
For other languages, omit "transliteration".
`;
}

export function buildSystemPrompt(lang: Language): string {
  return `You are the assistant inside a personal language-learning app.
The learner is currently studying ${lang.fullName}. The learner's own language is English.
${lang.promptNotes ? `\n${lang.promptNotes}\n` : ''}
Guidelines:
- Answer language-learning questions accurately. If something is uncertain or varies by region/register, say so briefly.
- Prefer natural, contemporary ${lang.fullName} unless asked otherwise.
- Distinguish literal and natural translations when that is relevant.
- Keep explanations concise: a few sentences, no long essays.
- When examples are requested, produce useful variation (different structures, situations, persons, tenses), not near-identical sentences.
- Example sentences are in ${lang.fullName} unless the learner explicitly asks for another language.
- Usually give 3–6 example sentences. If the question needs no examples, "sentences" may be empty.
${transliterationRules()}
Response format — ALWAYS reply with a single JSON object and nothing else (no Markdown, no code fences):
{
  "explanation": "optional short explanation in English (plain text)",
  "sentences": [
    { "text": "sentence in the target language", "transliteration": "only for the languages listed above", "translation": "natural English translation", "note": "optional very short note, e.g. a key word or grammar point" }
  ]
}`;
}


export type SentenceOp =
  | 'more'
  | 'sameVocab'
  | 'sameMeaning'
  | 'followUp'
  | 'translate'
  | 'breakdown'
  | 'grammar';

export const SENTENCE_OPS: { id: SentenceOp; label: string }[] = [
  { id: 'more', label: 'More examples' },
  { id: 'sameVocab', label: 'Same vocab, different meaning' },
  { id: 'sameMeaning', label: 'Same meaning, different vocab' },
  { id: 'followUp', label: 'Follow-up' },
  { id: 'translate', label: 'Translate' },
  { id: 'breakdown', label: 'Breakdown' },
  { id: 'grammar', label: 'Explain grammar' },
];

const FORMAT_REMINDER = 'Return a short explanation if useful, and return all sentences using the required JSON response format.';

/** How the focus is introduced to the LLM, at the start of a prompt. */
export function focusHeader(focus: Focus): string {
  if (focus.source && focus.source !== focus.text)
    return `Focus expression (a word, expression or part of a word selected by the learner):\n"${focus.text}"\n\nIt was taken from this sentence:\n"${focus.source}"\n\nWork on the focus expression; use the sentence only as context.\n\n`;
  return `Current sentence:\n"${focus.text}"\n\n`;
}

export function sentenceOpPrompt(op: SentenceOp, lang: Language, focus: Focus, target?: Language): string {
  const head = `The learner is studying ${lang.fullName}.\n\n${focusHeader(focus)}`;
  const body: Record<SentenceOp, string> = {
    more: 'Generate several new example sentences similar to this one (similar structure and theme), with meaningful variation.',
    sameVocab:
      'Reuse the important vocabulary from this sentence in several different situations, so the sentences mean clearly different things.',
    sameMeaning:
      'Generate several sentences that preserve the broad intended meaning of this sentence but use different vocabulary and phrasing (e.g. more formal, more casual, different verbs).',
    followUp:
      'Generate several natural utterances that could come immediately before or after this sentence in a real conversation. Mark in the note whether each is a "before" or "after" line and who might say it.',
    translate: `Translate this into ${target?.fullName ?? 'English'}${target?.promptNotes ? ` (${target.promptNotes})` : ''}. Put the translation(s) in "sentences" with "text" in ${target?.fullName ?? 'English'} and "translation" in English (the note may compare it with the original). If there are both a literal and a more natural rendering, give both and say which is which in the note.`,
    breakdown:
      'Explain it piece by piece: each word, meaningful chunk or morpheme, its meaning and role. Put the breakdown in "explanation" (one line per piece). Return the original text in "sentences" with its translation.',
    grammar:
      'Explain the important grammar used here, concisely. Put the explanation in "explanation" and add a few short example sentences illustrating the same grammar points.',
  };
  return head + body[op] + '\n\n' + FORMAT_REMINDER;
}

export type GeneralOp = 'examples' | 'dialogue' | 'concept';

export const GENERAL_OPS: { id: GeneralOp; label: string }[] = [
  { id: 'examples', label: 'Generate examples' },
  { id: 'dialogue', label: 'Start short dialogue' },
  { id: 'concept', label: 'Explain grammar concept' },
];

/**
 * Operations without a selected sentence. They prefill the input; `topic` is
 * whatever the learner already typed (may be empty).
 */
export function generalOpPrompt(op: GeneralOp, lang: Language, topic: string): string {
  const t = topic.trim();
  switch (op) {
    case 'examples':
      return t
        ? `Give me useful example sentences about: ${t}`
        : `Give me a varied set of useful everyday ${lang.fullName} sentences.`;
    case 'dialogue':
      return `Write a short natural dialogue (6–8 lines) in ${lang.fullName}${t ? ` about: ${t}` : ' in an everyday situation'}. Each line is one sentence entry; put the speaker (A/B) in the note.`;
    case 'concept':
      return t
        ? `Explain this ${lang.fullName} grammar concept: ${t}`
        : `Explain an important ${lang.fullName} grammar concept for an intermediate learner, with examples.`;
  }
}

const POS_LIST = PARTS_OF_SPEECH.map((p) => `"${p}"`).join(' | ');
const POS_HELP = `"adposition" = preposition or postposition; "grammar" = particle, affix, case ending or other grammatical element`;

/**
 * One-shot lookup for a selected fragment (Explain / quick save): its
 * translation, transliteration and a short explanation, in context.
 */
export function lookupPrompt(lang: Language, focus: Focus): string {
  return `The learner is studying ${lang.fullName}.

${focusHeader(focus)}Return exactly one entry in "sentences": "text" is exactly "${focus.text}", "translation" is its English meaning in this context (short), "pos" is one of ${POS_LIST}, and "note" is very short (e.g. dictionary form). In "explanation", briefly explain its meaning, form and usage here (2–4 sentences).
For "pos": ${POS_HELP}.`;
}

/**
 * Batch completion of saved items that miss fields (they were saved by an
 * older version of the app). `withPos` for vocabulary.
 */
export function fillPrompt(lang: Language, items: { text: string; source?: string | null }[], withPos: boolean): string {
  const list = items
    .map((it, i) => `${i + 1}. "${it.text}"${it.source ? ` (taken from: "${it.source}")` : ''}`)
    .join('\n');
  return `The learner saved these ${lang.fullName} ${withPos ? 'words/expressions' : 'sentences'}:
${list}

Return one entry per item in "sentences", in the same order, with "text" copied exactly, "translation" (natural English)${lang.transliteration ? ', "transliteration"' : ''}${withPos ? `, "pos" (one of ${POS_LIST}; ${POS_HELP})` : ''}, and an optional very short "note". No explanation needed.`;
}
