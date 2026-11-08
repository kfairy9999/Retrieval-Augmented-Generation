import { describe, expect, it } from "vitest";
import { MAX_CHUNKS_PER_DOCUMENT } from "../shared/models";
import { indexDocument } from "../src/lib/ingest";
import { VectorStore } from "../src/lib/rag";

const embed = (texts: string[]) => Promise.resolve(texts.map(() => [1, 0, 0]));

describe("indexDocument", () => {
  it("drops partial vectors when embedding fails", async () => {
    const store = new VectorStore();
    let calls = 0;
    await expect(indexDocument(
      "word ".repeat(4000),
      "doc",
      "notes.md",
      store,
      (texts) => {
        calls += 1;
        if (calls === 2) return Promise.reject(new Error("embed failed"));
        return embed(texts);
      },
      () => false,
      () => undefined,
    )).rejects.toThrow("embed failed");
    expect(store.countFor("doc")).toBe(0);
  });

  it("removes chunks when indexing is cancelled", async () => {
    const store = new VectorStore();
    let calls = 0;
    const result = await indexDocument(
      "word ".repeat(4000),
      "doc",
      "notes.md",
      store,
      (texts) => {
        calls += 1;
        return embed(texts);
      },
      () => calls >= 1,
      () => undefined,
    );
    expect(result.chunkCount).toBe(0);
    expect(store.countFor("doc")).toBe(0);
  });

  it("caps how many chunks one document can embed", async () => {
    const store = new VectorStore();
    const result = await indexDocument(
      "a".repeat(100_000),
      "doc",
      "long.txt",
      store,
      embed,
      () => false,
      () => undefined,
    );
    expect(result.truncated).toBe(true);
    expect(result.chunkCount).toBe(MAX_CHUNKS_PER_DOCUMENT);
  });
});
