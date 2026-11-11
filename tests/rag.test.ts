import { describe, expect, it } from "vitest";
import { CHUNK_SIZE, cosineSimilarity, rankChunks, splitText, VectorStore } from "../src/lib/rag";
import { offlineRetrievalChecks } from "../src/lib/retrievalEval";

describe("splitText", () => {
  it("returns nothing for blank input", () => {
    expect(splitText("  \n\t ", "doc", "empty.txt")).toEqual([]);
  });

  it("keeps a short note in one chunk", () => {
    const chunks = splitText("Photosynthesis stores energy.", "doc", "plants.md");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toBe("Photosynthesis stores energy.");
    expect(chunks[0]?.metadata.source).toBe("plants.md");
  });

  it("breaks on a paragraph boundary and overlaps the next chunk", () => {
    const text = `${"a".repeat(700)}\n\n${"b".repeat(700)}`;
    const chunks = splitText(text, "doc", "notes.md");
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.content).toBe("a".repeat(700));
    expect(chunks[1]?.content.startsWith("a")).toBe(true);
    expect(chunks[1]?.content.endsWith("b")).toBe(true);
    expect(chunks[1]!.metadata.start).toBeGreaterThan(chunks[0]!.metadata.start);
  });

  it("starts the next chunk on a markdown heading", () => {
    const text = `${"a".repeat(700)}\n# Title\n${"b".repeat(400)}`;
    const chunks = splitText(text, "doc", "notes.md");
    expect(chunks[1]?.content).toContain("# Title");
  });

  it("advances through a long string without exceeding the chunk budget", () => {
    const chunks = splitText("word ".repeat(5000), "doc", "long.txt");
    expect(chunks.length).toBeGreaterThan(5);
    for (let index = 1; index < chunks.length; index++) {
      expect(chunks[index]!.metadata.start).toBeGreaterThan(chunks[index - 1]!.metadata.start);
    }
    expect(chunks.every((chunk) => chunk.content.length <= Math.floor(CHUNK_SIZE * 1.15))).toBe(true);
  });

  it("records a PDF page marker when one is present", () => {
    const chunks = splitText("--- Page 4 ---\nA fact about rivers.", "doc", "rivers.pdf");
    expect(chunks[0]?.metadata.page).toBe(4);
  });
});

describe("cosine similarity and ranking", () => {
  it("scores identical, orthogonal, opposite, and empty vectors", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
    expect(cosineSimilarity([0, 0], [1, 0])).toBe(0);
    expect(cosineSimilarity([1], [1, 0])).toBe(0);
  });

  it("passes the offline retrieval checks", () => {
    const failed = offlineRetrievalChecks().filter((check) => !check.passed);
    expect(failed).toEqual([]);
  });

  it("filters the vector store by document id", () => {
    const store = new VectorStore();
    store.add([
      { id: "a", docId: "one", content: "alpha", metadata: { source: "a.txt", start: 0, end: 5 }, embedding: [1, 0] },
      { id: "b", docId: "two", content: "beta", metadata: { source: "b.txt", start: 0, end: 4 }, embedding: [1, 0] },
    ]);
    expect(rankChunks([1, 0], [], ["one"], 4)).toEqual([]);
    const hits = store.search([1, 0], ["two"], 4);
    expect(hits.map((hit) => hit.id)).toEqual(["b"]);
    store.removeDoc("two");
    expect(store.search([1, 0], ["two"], 4)).toEqual([]);
  });
});
