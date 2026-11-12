/**
 * IndexedDB collections for the library.
 * Passages and vectors stay on this device. This file never calls the network.
 */

export const DB_NAME = "personal-knowledge-engine";
export const DB_VERSION = 1;

export const DOCUMENT_STORE = "documents";
export const CHUNK_STORE = "chunks";

export interface DocumentRecord {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: number;
  chunkCount: number;
  capHit: boolean;
  /** True only for the bundled sample, so a restored copy stays labeled as a demo. */
  demo: boolean;
}

export interface ChunkMetadata {
  source: string;
  start: number;
  end: number;
  page?: number;
}

export interface ChunkRecord {
  id: string;
  documentId: string;
  text: string;
  heading: string | null;
  metadata: ChunkMetadata;
  /** Gemini embeddings are 768 numbers. Keyword-mode vectors are longer. */
  embedding: Float32Array;
}

export interface LibraryRecords {
  documents: DocumentRecord[];
  chunks: ChunkRecord[];
}

export interface DocumentDatabase {
  read(): Promise<LibraryRecords>;
  write(document: DocumentRecord, chunks: ChunkRecord[]): Promise<void>;
  delete(documentId: string): Promise<void>;
  clear(): Promise<void>;
  close(): void;
}

export function indexedDbDatabase(factory: IDBFactory, name = DB_NAME): Promise<DocumentDatabase> {
  return openDatabase(factory, name).then((db) => ({
    read: () => readLibrary(db),
    write: (document, chunks) => writeDocument(db, document, chunks),
    delete: (documentId) => deleteDocument(db, documentId),
    clear: () => clearLibrary(db),
    close: () => db.close(),
  }));
}

export function openDatabase(factory: IDBFactory, name = DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(name, DB_VERSION);
    } catch (error) {
      reject(error instanceof Error ? error : new Error("IndexedDB is unavailable."));
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DOCUMENT_STORE)) {
        const documents = db.createObjectStore(DOCUMENT_STORE, { keyPath: "id" });
        documents.createIndex("createdAt", "createdAt");
      }
      if (!db.objectStoreNames.contains(CHUNK_STORE)) {
        const chunks = db.createObjectStore(CHUNK_STORE, { keyPath: "id" });
        chunks.createIndex("documentId", "documentId");
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error("IndexedDB could not be opened."));
  });
}

function readLibrary(db: IDBDatabase): Promise<LibraryRecords> {
  const tx = db.transaction([DOCUMENT_STORE, CHUNK_STORE], "readonly");
  const documentsRequest = tx.objectStore(DOCUMENT_STORE).index("createdAt").getAll();
  const chunksRequest = tx.objectStore(CHUNK_STORE).getAll();
  return transactionDone(tx).then(() => ({
    documents: documentsRequest.result as DocumentRecord[],
    chunks: chunksRequest.result as ChunkRecord[],
  }));
}

function writeDocument(db: IDBDatabase, document: DocumentRecord, chunks: ChunkRecord[]): Promise<void> {
  const tx = db.transaction([DOCUMENT_STORE, CHUNK_STORE], "readwrite");
  const chunkStore = tx.objectStore(CHUNK_STORE);
  const existing = chunkStore.index("documentId").getAllKeys(document.id);
  existing.onsuccess = () => {
    for (const key of existing.result) chunkStore.delete(key);
    tx.objectStore(DOCUMENT_STORE).put(document);
    for (const chunk of chunks) chunkStore.put(chunk);
  };
  return transactionDone(tx);
}

function deleteDocument(db: IDBDatabase, documentId: string): Promise<void> {
  const tx = db.transaction([DOCUMENT_STORE, CHUNK_STORE], "readwrite");
  tx.objectStore(DOCUMENT_STORE).delete(documentId);
  const chunkStore = tx.objectStore(CHUNK_STORE);
  const existing = chunkStore.index("documentId").getAllKeys(documentId);
  existing.onsuccess = () => {
    for (const key of existing.result) chunkStore.delete(key);
  };
  return transactionDone(tx);
}

function clearLibrary(db: IDBDatabase): Promise<void> {
  const tx = db.transaction([DOCUMENT_STORE, CHUNK_STORE], "readwrite");
  tx.objectStore(DOCUMENT_STORE).clear();
  tx.objectStore(CHUNK_STORE).clear();
  return transactionDone(tx);
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let failure: unknown = null;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };
    tx.oncomplete = () => finish();
    tx.onerror = () => {
      failure = tx.error ?? failure;
    };
    tx.onabort = () => finish(failure ?? tx.error ?? new Error("IndexedDB transaction failed."));
  });
}
