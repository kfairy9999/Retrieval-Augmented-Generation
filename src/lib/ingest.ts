import { EMBED_BATCH_SIZE, MAX_CHUNKS_PER_DOCUMENT } from "../../shared/models";
import type { DocumentChunk } from "../types";
import { splitText, type VectorStore } from "./rag";

export interface IndexResult {
  chunkCount: number;
  truncated: boolean;
}

export async function indexDocument(
  text: string,
  docId: string,
  sourceName: string,
  store: VectorStore,
  embed: (texts: string[]) => Promise<number[][]>,
  isCancelled: () => boolean,
  onProgress: (progress: number) => void,
): Promise<IndexResult> {
  const chunks = splitText(text, docId, sourceName);
  if (chunks.length === 0) throw new Error("No text could be extracted from this file.");

  const truncated = chunks.length > MAX_CHUNKS_PER_DOCUMENT;
  const selected = truncated ? chunks.slice(0, MAX_CHUNKS_PER_DOCUMENT) : chunks;
  store.removeDoc(docId);

  try {
    for (let offset = 0; offset < selected.length; offset += EMBED_BATCH_SIZE) {
      if (isCancelled()) {
        store.removeDoc(docId);
        return { chunkCount: 0, truncated };
      }
      const batch = selected.slice(offset, offset + EMBED_BATCH_SIZE);
      const embeddings = await embed(batch.map((chunk) => chunk.content));
      if (embeddings.length !== batch.length) throw new Error("The embedding service returned the wrong number of vectors.");
      batch.forEach((chunk, index) => {
        chunk.embedding = embeddings[index];
      });
      if (isCancelled()) {
        store.removeDoc(docId);
        return { chunkCount: 0, truncated };
      }
      store.add(batch);
      onProgress(Math.min(1, (offset + batch.length) / selected.length));
    }
  } catch (error) {
    store.removeDoc(docId);
    throw error;
  }

  return { chunkCount: store.countFor(docId), truncated };
}

export function chunksForPrompt(chunks: DocumentChunk[]): Array<{ content: string; source: string; page?: number }> {
  return chunks.map((chunk) => ({
    content: chunk.content.slice(0, 2000),
    source: chunk.metadata.source,
    ...(chunk.metadata.page ? { page: chunk.metadata.page } : {}),
  }));
}
