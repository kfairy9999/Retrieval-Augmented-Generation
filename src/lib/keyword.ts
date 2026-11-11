/**
 * Keyword search used when the server has no embedding key.
 *
 * Each passage becomes a hashed bag-of-words vector (sublinear term frequency, light stemming,
 * English stop words removed). Ranking reuses the same cosine similarity as the Gemini path, so
 * the retrieval code does not change. It matches words, not meaning: "car" will not find "vehicle".
 */
export const KEYWORD_DIMENSIONS = 4096;

const STOP_WORDS = new Set(
  (
    "a an and are as at be but by can do does for from has have how i if in into is it its me my of on or our so " +
    "that the their them then there these they this to was we were what when where which who why will with you your " +
    "about after all also am any been before being both could did each few further had he her here hers him his " +
    "more most no nor not now off once only other out over own same she should some such than too under until up " +
    "very while would"
  ).split(" "),
);

export function tokenize(text: string): string[] {
  return (text.toLowerCase().normalize("NFKD").match(/[a-z0-9]+/g) ?? [])
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word))
    .map(stem);
}

/**
 * A deliberately small stemmer: enough to match "chunks" with "chunk", "indexing" with "index",
 * and "passages" with "passage". Plural first, then one common ending, then a trailing "e".
 */
export function stem(input: string): string {
  let word = input;
  if (word.length > 3 && word.endsWith("ies")) word = `${word.slice(0, -3)}y`;
  else if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us")) word = word.slice(0, -1);
  for (const suffix of ["ation", "ing", "ed", "ly"]) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
      word = word.slice(0, -suffix.length);
      break;
    }
  }
  if (word.length > 3 && word.endsWith("e")) word = word.slice(0, -1);
  return word;
}

function hash(token: string): number {
  // FNV-1a, 32-bit.
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % KEYWORD_DIMENSIONS;
}

export function keywordVector(text: string): number[] {
  const counts = new Map<number, number>();
  for (const token of tokenize(text)) {
    const slot = hash(token);
    counts.set(slot, (counts.get(slot) ?? 0) + 1);
  }
  const vector = new Array<number>(KEYWORD_DIMENSIONS).fill(0);
  for (const [slot, count] of counts) vector[slot] = 1 + Math.log(count);
  return vector;
}

export function keywordVectors(texts: string[]): number[][] {
  return texts.map(keywordVector);
}
