import { indexedDB as fakeIndexedDB } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { DocumentStore, STORAGE_QUOTA_NOTE, STORAGE_UNAVAILABLE_NOTE } from "../src/lib/documentStore";
import { indexDocument } from "../src/lib/ingest";
import { indexedDbDatabase, type DocumentDatabase, type DocumentRecord } from "../src/lib/indexedDb";
import { VectorStore } from "../src/lib/rag";
import type { DocumentChunk } from "../src/types";

describe("IndexedDB document store", () => {
  it("starts empty and restores passages after a new connection", async () => {
    const first = store("reload");
    const opened = await first.open();
    expect(opened).toEqual({ documents: [], mode: "indexeddb", notice: null });
    expect(first.search(vector(), ["doc-1"], 4)).toEqual([]);

    const scratch = new VectorStore();
    const text = "--- Page 2 ---\n# Rivers\n\nA fact about rivers.";
    const result = await indexDocument(text, "doc-1", "rivers.md", scratch, embed, () => false, () => undefined);
    const saved = await first.put(
      document("doc-1", "rivers.md", 5, { demo: false, capHit: result.truncated }),
      scratch.chunksFor("doc-1"),
    );
    expect(saved).toEqual({ persisted: true, notice: null });
    expect(result.chunkCount).toBe(1);
    first.close();

    const second = store("reload");
    const restored = await second.open();
    expect(restored.documents.map((item) => item.name)).toEqual(["rivers.md"]);
    expect(restored.documents[0]).toMatchObject({ chunkCount: 1, capHit: false, demo: false, size: 32 });
    const hits = second.search(vector(), ["doc-1"], 4);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.content).toContain("A fact about rivers.");
    expect(hits[0]?.metadata.page).toBe(2);
    expect(hits[0]?.score).toBeCloseTo(1);

    const raw = await indexedDbDatabase(fakeIndexedDB, "reload");
    const rows = await raw.read();
    expect(rows.chunks).toHaveLength(1);
    expect(rows.chunks[0]?.heading).toBe("Rivers");
    expect(rows.chunks[0]?.embedding).toBeInstanceOf(Float32Array);
    expect(Array.from(rows.chunks[0]?.embedding ?? [])).toEqual(vector());
    raw.close();
    second.close();
  });

  it("replaces a document's chunks instead of appending them", async () => {
    const library = store("replace");
    await library.open();
    await library.put(document("doc-1", "notes.md", 1), [
      passage("c1", "doc-1", "First version.", vector()),
      passage("c2", "doc-1", "Second version.", vector()),
    ]);
    await library.put(document("doc-1", "notes.md", 1), [
      passage("c3", "doc-1", "Rewritten.", vector(2)),
    ]);
    library.close();

    const reopened = store("replace");
    await reopened.open();
    const raw = await indexedDbDatabase(fakeIndexedDB, "replace");
    const rows = await raw.read();
    expect(rows.chunks.map((item) => item.id)).toEqual(["c3"]);
    expect(reopened.search(vector(2), ["doc-1"], 4).map((hit) => hit.content)).toEqual(["Rewritten."]);
    raw.close();
    reopened.close();
  });

  it("deletes one document's chunks and keeps the other", async () => {
    const library = store("cascade");
    await library.open();
    await library.put(document("keep", "keep.md", 1), [passage("keep-1", "keep", "Keep this.", vector())]);
    await library.put(document("drop", "drop.md", 2), [passage("drop-1", "drop", "Drop this.", vector(2))]);
    await library.delete("drop");
    expect(library.search(vector(2), ["drop"], 4)).toEqual([]);
    expect(library.search(vector(), ["keep"], 4)).toHaveLength(1);
    library.close();

    const reopened = store("cascade");
    const restored = await reopened.open();
    expect(restored.documents.map((item) => item.id)).toEqual(["keep"]);
    expect(reopened.search(vector(2), ["drop"], 4)).toEqual([]);
    const raw = await indexedDbDatabase(fakeIndexedDB, "cascade");
    const rows = await raw.read();
    expect(rows.documents.map((item) => item.id)).toEqual(["keep"]);
    expect(rows.chunks.map((item) => item.documentId)).toEqual(["keep"]);
    raw.close();

    await reopened.clear();
    reopened.close();
    const cleared = store("cascade");
    expect((await cleared.open()).documents).toEqual([]);
    cleared.close();
  });

  it("uses memory for the session when IndexedDB cannot be opened", async () => {
    const library = new DocumentStore(() => Promise.reject(new DOMException("The operation is insecure.", "SecurityError")));
    const opened = await library.open();
    expect(opened.mode).toBe("memory");
    expect(opened.documents).toEqual([]);
    expect(opened.notice).toBe(STORAGE_UNAVAILABLE_NOTE);

    const saved = await library.put(document("doc-1", "notes.md", 1), [passage("c1", "doc-1", "Leaves.", vector())]);
    expect(saved).toEqual({ persisted: false, notice: STORAGE_UNAVAILABLE_NOTE });
    expect(library.search(vector(), ["doc-1"], 4)).toHaveLength(1);

    const untouched = store("untouched-by-fallback");
    expect((await untouched.open()).documents).toEqual([]);
    untouched.close();
    library.close();
  });

  it("keeps searching after a quota error and does not pretend the write landed", async () => {
    let writes = 0;
    let cleared = false;
    const backend: DocumentDatabase = {
      read: () => Promise.resolve({ documents: [], chunks: [] }),
      write: () => {
        writes += 1;
        return Promise.reject(new DOMException("The quota has been exceeded.", "QuotaExceededError"));
      },
      delete: () => Promise.resolve(),
      clear: () => {
        cleared = true;
        return Promise.resolve();
      },
      close: () => undefined,
    };
    const library = new DocumentStore(() => Promise.resolve(backend));
    expect((await library.open()).mode).toBe("indexeddb");

    const saved = await library.put(document("doc-1", "notes.md", 1), [passage("c1", "doc-1", "Leaves.", vector())]);
    expect(saved).toEqual({ persisted: false, notice: STORAGE_QUOTA_NOTE });
    expect(library.storageMode).toBe("memory");
    expect(library.search(vector(), ["doc-1"], 4)).toHaveLength(1);

    await library.put(document("doc-2", "more.md", 2), [passage("c2", "doc-2", "Roots.", vector(2))]);
    expect(writes).toBe(1);
    expect(library.search(vector(2), ["doc-2"], 4)).toHaveLength(1);

    await library.clear();
    expect(cleared).toBe(true);
    expect(library.search(vector(), ["doc-1"], 4)).toEqual([]);
    library.close();
  });
});

function store(name: string): DocumentStore {
  return new DocumentStore(() => indexedDbDatabase(fakeIndexedDB, name));
}

function embed(texts: string[]): Promise<number[][]> {
  return Promise.resolve(texts.map(() => vector()));
}

function vector(seed = 1): number[] {
  const values = new Array<number>(768).fill(0);
  values[0] = seed;
  return values;
}

function document(id: string, name: string, createdAt: number, extra?: { demo?: boolean; capHit?: boolean }): DocumentRecord {
  return {
    id,
    name,
    type: "text/markdown",
    size: 32,
    createdAt,
    chunkCount: 1,
    capHit: extra?.capHit ?? false,
    demo: extra?.demo ?? false,
  };
}

function passage(id: string, docId: string, text: string, embedding: number[]): DocumentChunk {
  return {
    id,
    docId,
    content: text,
    metadata: { source: `${docId}.md`, start: 0, end: text.length },
    embedding,
  };
}
