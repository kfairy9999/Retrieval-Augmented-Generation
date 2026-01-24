export enum DocStatus {
  UPLOADING = 'UPLOADING',
  PROCESSING = 'PROCESSING', // Splitting text
  EMBEDDING = 'EMBEDDING',   // Generating vectors
  INDEXED = 'INDEXED',       // Ready for search
  ERROR = 'ERROR'
}

export interface UploadedDocument {
  id: string;
  name: string;
  type: string;
  size: number;
  content: string;
  status: DocStatus;
  chunkCount: number;
  uploadedAt: Date;
}

export interface DocumentChunk {
  id: string;
  docId: string;
  content: string;
  metadata: {
    source: string;
    start: number;
    end: number;
  };
  embedding?: number[];
}

export interface SearchResult extends DocumentChunk {
  score: number; // Similarity score (0-1)
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
  sources?: SearchResult[];
  isThinking?: boolean;
}
