import type { DocumentChunk, SearchResult } from "../types";

export const CHUNK_SIZE = 1000;
export const CHUNK_OVERLAP = 200;

const SEPARATORS = ["\n## ", "\n# ", "\n\n", "\n", ". ", " ", ""];

export function splitText(text: string, docId: string, sourceName: string): DocumentChunk[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\t/g, "  ").trim();
  if (!normalized) return [];

  const raw: DocumentChunk[] = [];
  let start = 0;
  let guard = 0;

  while (start < normalized.length) {
    if (++guard > 100_000) throw new Error("Chunking did not advance.");

    let end = Math.min(start + CHUNK_SIZE, normalized.length);
    if (end < normalized.length) {
      const windowStart = start + Math.floor(CHUNK_SIZE * 0.5);
      for (const separator of SEPARATORS) {
        if (!separator) break;
        const index = normalized.lastIndexOf(separator, end);
        if (index < windowStart) continue;
        const isHeading = separator.startsWith("\n#");
        const nextEnd = isHeading ? index : index + separator.length;
        if (nextEnd <= start) continue;
        end = nextEnd;
        break;
      }
    }

    const content = normalized.slice(start, end).trim();
    if (content) {
      const pageMatch = content.match(/--- Page (\d+) ---/);
      raw.push({
        id: crypto.randomUUID(),
        docId,
        content,
        metadata: {
          source: sourceName,
          start,
          end,
          ...(pageMatch ? { page: Number(pageMatch[1]) } : {}),
        },
      });
    }

    if (end >= normalized.length) break;
    const next = Math.max(start + 1, end - CHUNK_OVERLAP);
    if (next <= start) throw new Error("Chunking did not advance.");
    start = next;
  }

  return mergeTiny(raw);
}

function mergeTiny(chunks: DocumentChunk[]): DocumentChunk[] {
  const merged: DocumentChunk[] = [];
  for (const chunk of chunks) {
    const previous = merged[merged.length - 1];
    if (previous && chunk.content.length < 40 && previous.content.length + chunk.content.length <= Math.floor(CHUNK_SIZE * 1.15)) {
      previous.content = `${previous.content} ${chunk.content}`.trim();
      previous.metadata.end = chunk.metadata.end;
      if (previous.metadata.page == null && chunk.metadata.page != null) {
        previous.metadata.page = chunk.metadata.page;
      }
      continue;
    }
    merged.push(chunk);
  }
  return merged;
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length === 0 || vecA.length !== vecB.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function rankChunks(
  queryEmbedding: number[],
  chunks: DocumentChunk[],
  docIds: string[],
  topK: number,
): SearchResult[] {
  if (topK <= 0 || docIds.length === 0) return [];
  const allowed = new Set(docIds);
  return chunks
    .filter((chunk) => allowed.has(chunk.docId) && chunk.embedding && chunk.embedding.length === queryEmbedding.length)
    .map((chunk) => ({
      ...chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding ?? []),
    }))
    .sort((a, b) => b.score - a.score || a.metadata.start - b.metadata.start)
    .slice(0, topK);
}

export class VectorStore {
  private chunks: DocumentChunk[] = [];

  add(chunks: DocumentChunk[]): void {
    this.chunks.push(...chunks);
  }

  removeDoc(docId: string): void {
    this.chunks = this.chunks.filter((chunk) => chunk.docId !== docId);
  }

  search(queryEmbedding: number[], docIds: string[], topK: number): SearchResult[] {
    return rankChunks(queryEmbedding, this.chunks, docIds, topK);
  }

  countFor(docId: string): number {
    return this.chunks.filter((chunk) => chunk.docId === docId).length;
  }
}

export const vectorStore = new VectorStore();
