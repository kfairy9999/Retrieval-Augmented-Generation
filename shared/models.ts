/** Gemini model ids used by the server. The browser only displays these names. */
export const EMBEDDING_MODEL = "gemini-embedding-2";
export const CHAT_MODEL = "gemini-3.8-flash";

/** Recommended reduced size. Gemini Embedding 2 normalizes truncated dimensions. */
export const EMBEDDING_DIMENSIONS = 768;

export const TOP_K = 4;
export const EMBED_BATCH_SIZE = 8;
export const MAX_CHUNKS_PER_DOCUMENT = 80;
