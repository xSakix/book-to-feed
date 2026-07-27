/**
 * Sentence boundaries.
 *
 * Used in two places: splitting a paragraph that alone exceeds the hard budget
 * (#22), and picking a pull quote (#23). `Intl.Segmenter` handles the cases a
 * regex gets wrong — abbreviations, initials, decimals — and is available
 * everywhere we target, with a regex fallback for anything that lacks it.
 */

const ABBREVIATIONS = new Set([
  'mr',
  'mrs',
  'ms',
  'dr',
  'prof',
  'sr',
  'jr',
  'st',
  'mt',
  'vs',
  'etc',
  'e.g',
  'i.e',
  'cf',
  'no',
  'vol',
  'fig',
  'ch',
]);

export function splitSentences(text: string, locale?: string): string[] {
  const segmenter = makeSegmenter(locale);
  const raw = segmenter
    ? [...segmenter.segment(text)].map((part) => part.segment)
    : fallbackSplit(text);

  return mergeFalseBreaks(raw)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function makeSegmenter(locale?: string): Intl.Segmenter | undefined {
  if (typeof Intl?.Segmenter !== 'function') return undefined;
  try {
    return new Intl.Segmenter(locale, { granularity: 'sentence' });
  } catch {
    return undefined;
  }
}

/** Latin sentence enders plus the CJK forms, which are separate code points. */
function fallbackSplit(text: string): string[] {
  return text.split(/(?<=[.!?…。！？])\s+/);
}

/**
 * Rejoins splits that landed after an abbreviation or an initial.
 *
 * `Intl.Segmenter` is good but not perfect: "Mr. Holloway said nothing." can
 * come back as two sentences, and a post that ends at "Mr." is exactly the kind
 * of broken beat this whole engine exists to avoid.
 */
function mergeFalseBreaks(sentences: string[]): string[] {
  const merged: string[] = [];

  for (const sentence of sentences) {
    const previous = merged[merged.length - 1];
    if (previous !== undefined && endsWithAbbreviation(previous)) {
      merged[merged.length - 1] = `${previous}${sentence.startsWith(' ') ? '' : ' '}${sentence}`;
      continue;
    }
    merged.push(sentence);
  }

  return merged;
}

function endsWithAbbreviation(sentence: string): boolean {
  const trimmed = sentence.trimEnd();
  if (!trimmed.endsWith('.')) return false;

  const lastWord = trimmed.slice(0, -1).split(/[\s(]/).pop() ?? '';
  if (ABBREVIATIONS.has(lastWord.toLowerCase())) return true;

  // A single capital letter is an initial: "J. R. R. Tolkien".
  return /^[A-Z]$/.test(lastWord);
}

/** True when the text ends on a completed sentence rather than mid-clause. */
export function endsSentence(text: string): boolean {
  return /[.!?…。！？][)"'”’»」]?$/.test(text.trimEnd());
}

/** A question, exclamation or trailing ellipsis — a beat worth ending a post on. */
export function endsOnCliffhanger(text: string): boolean {
  return /[!?…！？][)"'”’»」]?$/.test(text.trimEnd());
}

/**
 * True when the text stops mid-clause: a trailing comma, colon, dash, or a
 * conjunction left dangling.
 */
export function endsMidClause(text: string): boolean {
  const trimmed = text.trimEnd();
  if (/[,;:—–-]$/.test(trimmed)) return true;
  const lastWord = trimmed.split(/\s+/).pop()?.toLowerCase() ?? '';
  return CONJUNCTIONS.has(lastWord);
}

const CONJUNCTIONS = new Set([
  'and',
  'but',
  'or',
  'nor',
  'so',
  'yet',
  'because',
  'although',
  'though',
  'while',
  'whereas',
  'if',
  'unless',
  'until',
  'than',
  'that',
  'which',
  'who',
  'when',
  'as',
]);
