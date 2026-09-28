import { isLetter } from "../layouts";
import { type Rng, pick, pickWeighted, shuffle } from "../lib/rng";

/** Characters that wrap a word instead of following it. */
const WRAPS: Record<string, string> = { "(": ")", ")": "(", "[": "]", "]": "[", '"': '"', "{": "}", "}": "{" };

export interface Alphabet {
  letters: string[];
  capitals: Set<string>;
  marks: string[];
  digits: string[];
}

export function splitAlphabet(allowed: Iterable<string>, toLower: (ch: string) => string): Alphabet {
  const letters: string[] = [];
  const capitals = new Set<string>();
  const marks: string[] = [];
  const digits: string[] = [];
  for (const ch of allowed) {
    if (ch === " ") continue;
    if (/\d/.test(ch)) digits.push(ch);
    else if (!isLetter(ch)) marks.push(ch);
    else if (toLower(ch) === ch) letters.push(ch);
    else capitals.add(ch);
  }
  return { letters: [...new Set(letters)], capitals, marks: [...new Set(marks)], digits: [...new Set(digits)] };
}

/** Join tokens into a line of roughly `length` characters. */
function fill(length: number, next: () => string): string {
  const out: string[] = [];
  let n = 0;
  let guard = 0;
  while (n < length && guard++ < 500) {
    const tok = next();
    if (!tok) continue;
    out.push(tok);
    n += tok.length + 1;
  }
  return out.join(" ");
}

/** Pseudo-word from weighted characters, avoiding triple repeats. */
export function pseudoWord(rng: Rng, chars: string[], weight: (ch: string) => number, min = 2, max = 5): string {
  const len = min + Math.floor(rng() * (max - min + 1));
  let w = "";
  for (let i = 0; i < len; i++) {
    let ch = pickWeighted(rng, chars, weight);
    if (chars.length > 1) {
      let tries = 0;
      while (w.length >= 2 && w.endsWith(ch + ch) && tries++ < 5) ch = pickWeighted(rng, chars, weight);
    }
    w += ch;
  }
  return w;
}

/** First exposure to new keys: repetition plus "reach and return" to the finger's home key. */
export function introText(rng: Rng, newChars: string[], anchorOf: (ch: string) => string | undefined, toLower: (ch: string) => string): string {
  const tokens: string[] = [];
  for (const ch of newChars) {
    if (isLetter(ch) && toLower(ch) !== ch) {
      const lo = toLower(ch);
      tokens.push(ch + lo, ch + lo + lo, ch + lo);
      continue;
    }
    tokens.push(ch.repeat(3), ch.repeat(2));
    const anchor = anchorOf(ch);
    if (anchor && anchor !== ch) tokens.push(anchor + ch + anchor, ch + anchor + ch);
  }
  if (newChars.length > 1) {
    for (let i = 0; i < 3; i++) tokens.push(pseudoWord(rng, newChars, () => 1, 2, 4));
  }
  // Two passes: first in order, then shuffled order for recall.
  const second = shuffle(rng, tokens);
  return [...tokens, ...second].join(" ");
}

export interface GenOptions {
  rng: Rng;
  alphabet: Alphabet;
  /** Relative weight per character; newly introduced or weak keys get more. */
  weight: (ch: string) => number;
  length: number;
  toUpper: (ch: string) => string;
  /** Chance that a word gets a punctuation mark / that a token is a number. */
  markRate?: number;
  digitRate?: number;
  /** Endings used after an apostrophe (e.g. "Ali'nin", "don't"). */
  suffixes?: string[];
}

function decorate(o: GenOptions, word: string): string {
  const { rng, alphabet } = o;
  let w = word;
  const first = o.toUpper(w[0]);
  if (alphabet.capitals.has(first) && rng() < 0.35) w = first + w.slice(1);
  if (alphabet.marks.length && rng() < (o.markRate ?? 0.25)) {
    const m = pickWeighted(rng, alphabet.marks, o.weight);
    const pair = WRAPS[m];
    if (pair) w = m === ")" || m === "]" || m === "}" ? pair + w + m : m + w + pair;
    else if (m === "-" || m === "/" || m === "+" || m === "=" || m === "*" || m === "&") w = rng() < 0.5 ? `${w}${m}${w.length > 3 ? w.slice(0, 2) : w}` : `${m}${w}`;
    else if (m === "@" || m === "#" || m === "$" || m === "€") w = m + w;
    else if (m === "'") {
      const letters = new Set(alphabet.letters);
      const ok = (o.suffixes ?? []).filter((x) => Array.from(x).every((ch) => letters.has(ch)));
      w = ok.length ? `${w}'${pick(rng, ok)}` : `'${w}'`;
    }
    else w = w + m;
  }
  return w;
}

function numberToken(o: GenOptions): string {
  const len = 1 + Math.floor(o.rng() * 4);
  let s = "";
  for (let i = 0; i < len; i++) s += pickWeighted(o.rng, o.alphabet.digits, o.weight);
  return s;
}

/** Random pseudo-words mixing new and known keys. */
export function drillText(o: GenOptions): string {
  const { letters, capitals, digits } = o.alphabet;
  return fill(o.length, () => {
    if (digits.length && o.rng() < (o.digitRate ?? 0.15)) return numberToken(o);
    if (letters.length === 0) return capitals.size ? pick(o.rng, [...capitals]) : numberToken(o);
    return decorate(o, pseudoWord(o.rng, letters, o.weight));
  });
}

/** Real words spelled only with allowed letters; falls back to pseudo-words when too few exist. */
export function wordsText(o: GenOptions, dictionary: string[]): string {
  const letterSet = new Set(o.alphabet.letters);
  const candidates = dictionary.filter((w) => Array.from(w).every((ch) => letterSet.has(ch)));
  if (candidates.length < 6) return drillText(o);
  const score = (w: string) => Array.from(w).reduce((a, ch) => a + o.weight(ch), 0) / w.length;
  let prev = "";
  return fill(o.length, () => {
    if (o.alphabet.digits.length && o.rng() < (o.digitRate ?? 0.15)) return numberToken(o);
    let w = pickWeighted(o.rng, candidates, score);
    if (w === prev) w = pickWeighted(o.rng, candidates, score);
    prev = w;
    return decorate(o, w);
  });
}

/** Whole sentences whose characters are all typeable. */
export function sentenceText(rng: Rng, sentences: string[], typeable: (ch: string) => boolean, length: number): string {
  const pool = sentences.filter((s) => Array.from(s).every(typeable));
  if (pool.length === 0) return "";
  const out: string[] = [];
  let n = 0;
  let last = "";
  while (n < length) {
    let s = pick(rng, pool);
    if (s === last && pool.length > 1) s = pick(rng, pool);
    last = s;
    out.push(s);
    n += s.length + 1;
  }
  return out.join(" ");
}

/** Plain lowercase real words only: no capitals, punctuation or numbers. */
export function plainWordsText(rng: Rng, dictionary: string[], typeable: (ch: string) => boolean, toLower: (s: string) => string, length: number): string {
  const pool = [...new Set(dictionary.map(toLower))].filter((w) => w.length > 1 && Array.from(w).every((ch) => isLetter(ch) && typeable(ch)));
  if (pool.length === 0) return "";
  let prev = "";
  return fill(length, () => {
    let w = pick(rng, pool);
    if (w === prev && pool.length > 1) w = pick(rng, pool);
    prev = w;
    return w;
  });
}
