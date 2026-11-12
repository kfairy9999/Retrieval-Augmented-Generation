import { DocStatus, type DocumentChunk, type SearchResult, type UploadedDocument } from "../types";
import { indexedDbDatabase, DB_NAME, type ChunkRecord, type DocumentDatabase, type DocumentRecord } from "./indexedDb";
import { VectorStore } from "./rag";

export type { DocumentRecord, ChunkRecord };

export type StorageMode = "indexeddb" | "memory";

export interface OpenResult {
  documents: DocumentRecord[];
  mode: StorageMode;
  notice: string | null;
}

export interface WriteResult {
  persisted: boolean;
  notice: string | null;
}

export const DEVICE_LIBRARY_NOTE =
  "Documents stay in this browser, on this device, and survive a refresh. They are not stored on a server.";

export const STORAGE_UNAVAILABLE_NOTE =
  "This browser can’t save documents on this device. Anything you add stays in this tab and disappears when you close it.";

export const STORAGE_QUOTA_NOTE =
  "This device is out of space for more documents. Anything you add from now on stays in this tab and disappears when you close it.";

const DELETE_FAILED_NOTE =
  "I removed it from this tab, but this browser couldn’t delete the saved copy on this device.";

const CLEAR_FAILED_NOTE =
  "I cleared this tab, but this browser couldn’t clear the saved copy on this device.";

export function storageFailureMessage(error: unknown): string {
  return errorName(error) === "QuotaExceededError" ? STORAGE_QUOTA_NOTE : STORAGE_UNAVAILABLE_NOTE;
}

export function toUploadedDocument(record: DocumentRecord): UploadedDocument {
  return {
    id: record.id,
    name: record.name,
    type: record.type,
    size: record.size,
    status: DocStatus.INDEXED,
    chunkCount: record.chunkCount,
    progress: 1,
    uploadedAt: new Date(record.createdAt),
    truncated: record.capHit,
    demo: record.demo,
    stored: true,
  };
}

type Connect = () => Promise<DocumentDatabase>;

function defaultConnect(): Promise<DocumentDatabase> {
  const factory = globalThis.indexedDB;
  if (!factory) return Promise.reject(new Error("IndexedDB is unavailable."));
  return indexedDbDatabase(factory, DB_NAME);
}

/**
 * In-memory search index with an IndexedDB write-through.
 * If the browser cannot open or write IndexedDB, search keeps working for this page load only.
 */
export class DocumentStore {
  private memory = new VectorStore();
  private documents: DocumentRecord[] = [];
  private database: DocumentDatabase | null = null;
  private mode: StorageMode = "memory";
  private notice: string | null = null;
  private opened = false;
  private opening: Promise<OpenResult> | null = null;
  private generation = 0;

  constructor(private readonly connect: Connect = defaultConnect) {}

  get storageMode(): StorageMode {
    return this.mode;
  }

  get storageNotice(): string | null {
    return this.notice;
  }

  /** True when a device database is open, including after a later write has fallen back to memory. */
  get hasDeviceDatabase(): boolean {
    return this.database !== null;
  }

  open(): Promise<OpenResult> {
    if (this.opened) return Promise.resolve(this.snapshot());
    if (!this.opening) {
      const generation = this.generation;
      this.opening = this.load(generation);
    }
    return this.opening;
  }

  list(): DocumentRecord[] {
    return this.documents.map((document) => ({ ...document }));
  }

  search(queryEmbedding: number[], docIds: string[], topK: number): SearchResult[] {
    return this.memory.search(queryEmbedding, docIds, topK);
  }

  async put(document: DocumentRecord, chunks: DocumentChunk[]): Promise<WriteResult> {
    if (chunks.some((chunk) => chunk.docId !== document.id)) {
      throw new Error("A passage does not belong to this document.");
    }
    const records = chunks.map(chunkToRecord);
    const stored: DocumentRecord = { ...document, chunkCount: records.length };
    this.memory.removeDoc(stored.id);
    this.memory.add(chunks);
    this.documents = this.documents.filter((item) => item.id !== stored.id).concat(stored);
    this.documents.sort(byCreated);

    if (!this.database || this.mode !== "indexeddb") {
      return { persisted: false, notice: this.notice };
    }

    try {
      await this.database.write(stored, records);
      return { persisted: true, notice: null };
    } catch (error) {
      this.mode = "memory";
      this.notice = storageFailureMessage(error);
      return { persisted: false, notice: this.notice };
    }
  }

  async delete(id: string): Promise<{ notice: string | null }> {
    this.memory.removeDoc(id);
    this.documents = this.documents.filter((document) => document.id !== id);
    if (!this.database) return { notice: this.notice };
    try {
      await this.database.delete(id);
      return { notice: this.notice };
    } catch (error) {
      this.notice = errorName(error) === "QuotaExceededError" ? STORAGE_QUOTA_NOTE : DELETE_FAILED_NOTE;
      return { notice: this.notice };
    }
  }

  async clear(): Promise<{ notice: string | null }> {
    this.memory = new VectorStore();
    this.documents = [];
    if (!this.database) return { notice: null };
    try {
      await this.database.clear();
      return { notice: null };
    } catch {
      this.notice = CLEAR_FAILED_NOTE;
      return { notice: this.notice };
    }
  }

  close(): void {
    this.generation += 1;
    this.database?.close();
    this.database = null;
    this.opened = false;
    this.opening = null;
    this.memory = new VectorStore();
    this.documents = [];
    this.mode = "memory";
    this.notice = null;
  }

  private async load(generation: number): Promise<OpenResult> {
    let database: DocumentDatabase | null = null;
    try {
      database = await this.connect();
      const loaded = await database.read();
      if (generation !== this.generation) {
        database.close();
        return this.snapshot();
      }
      const documents = [...loaded.documents].sort(byCreated);
      this.database = database;
      this.documents = documents;
      this.memory = new VectorStore();
      this.memory.add(loaded.chunks.map(recordToChunk));
      this.mode = "indexeddb";
      this.notice = null;
      this.opened = true;
      return this.snapshot();
    } catch (error) {
      database?.close();
      if (generation !== this.generation) return this.snapshot();
      this.database = null;
      this.documents = [];
      this.memory = new VectorStore();
      this.mode = "memory";
      this.notice = storageFailureMessage(error);
      this.opened = true;
      return this.snapshot();
    } finally {
      if (generation === this.generation) this.opening = null;
    }
  }

  private snapshot(): OpenResult {
    return {
      documents: this.list(),
      mode: this.mode,
      notice: this.notice,
    };
  }
}

export const documentStore = new DocumentStore();

function byCreated(a: DocumentRecord, b: DocumentRecord): number {
  return a.createdAt - b.createdAt || a.id.localeCompare(b.id);
}

function errorName(error: unknown): string {
  if (typeof error === "object" && error !== null && "name" in error && typeof error.name === "string") {
    return error.name;
  }
  return "";
}

export function headingFrom(text: string): string | null {
  const match = text.match(/^#{1,6}[ \t]+(\S[^\n]*)$/m);
  if (!match?.[1]) return null;
  const heading = match[1].trim().replace(/\s+#+$/, "").trim();
  return heading ? heading.slice(0, 180) : null;
}

function chunkToRecord(chunk: DocumentChunk): ChunkRecord {
  if (!chunk.embedding || chunk.embedding.length === 0) {
    throw new Error("Cannot store a passage without a vector.");
  }
  return {
    id: chunk.id,
    documentId: chunk.docId,
    text: chunk.content,
    heading: headingFrom(chunk.content),
    metadata: {
      source: chunk.metadata.source,
      start: chunk.metadata.start,
      end: chunk.metadata.end,
      ...(chunk.metadata.page != null ? { page: chunk.metadata.page } : {}),
    },
    embedding: Float32Array.from(chunk.embedding),
  };
}

function recordToChunk(record: ChunkRecord): DocumentChunk {
  return {
    id: record.id,
    docId: record.documentId,
    content: record.text,
    metadata: { ...record.metadata },
    embedding: Array.from(record.embedding ?? []),
  };
}
