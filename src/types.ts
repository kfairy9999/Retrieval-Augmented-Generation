export const DocStatus = {
  UPLOADING: "UPLOADING",
  PROCESSING: "PROCESSING",
  EMBEDDING: "EMBEDDING",
  INDEXED: "INDEXED",
  ERROR: "ERROR",
} as const;

export type DocStatus = (typeof DocStatus)[keyof typeof DocStatus];

export interface UploadedDocument {
  id: string;
  name: string;
  type: string;
  size: number;
  status: DocStatus;
  chunkCount: number;
  progress: number;
  uploadedAt: Date;
  error?: string;
  truncated?: boolean;
  /** Bundled sample. A restored copy stays labeled as a demo, not as a personal file. */
  demo?: boolean;
  /** False when this indexed document exists only in tab memory. */
  stored?: boolean;
}

export interface DocumentChunk {
  id: string;
  docId: string;
  content: string;
  metadata: {
    source: string;
    start: number;
    end: number;
    page?: number;
  };
  embedding?: number[];
}

export interface SearchResult extends DocumentChunk {
  score: number;
}

export type MessageStatus = "retrieving" | "writing" | "done" | "error" | "refused";

export interface Message {
  id: string;
  role: "user" | "model";
  content: string;
  timestamp: Date;
  sources?: SearchResult[];
  status?: MessageStatus;
  error?: string;
  question?: string;
  searchQuery?: string;
}
