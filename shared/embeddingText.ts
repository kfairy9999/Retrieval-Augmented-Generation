/**
 * gemini-embedding-2 does not accept taskType. Google documents these
 * asymmetric prefixes for question answering.
 * https://ai.google.dev/gemini-api/docs/embeddings
 */
export function formatDocument(title: string, text: string): string {
  const safeTitle = title.replace(/[\r\n|]+/g, " ").trim() || "none";
  return `title: ${safeTitle} | text: ${text}`;
}

export function formatQuery(query: string): string {
  return `task: question answering | query: ${query}`;
}
