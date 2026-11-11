import { describe, expect, it } from "vitest";
import { KEYWORD_DIMENSIONS, keywordVector, stem, tokenize } from "../src/lib/keyword";
import { cosineSimilarity, rankChunks, splitText } from "../src/lib/rag";
import { keywordVectors } from "../src/lib/keyword";
import sample from "../src/samples/how-this-app-works.md?raw";

describe("keyword search fallback", () => {
  it("drops stop words and trims simple endings", () => {
    expect(tokenize("Where do the API keys live?")).toEqual(["api", "key", "liv"]);
    expect(stem("lives")).toBe(stem("live"));
    expect(stem("passages")).toBe("passag");
    expect(stem("passage")).toBe("passag");
    expect(stem("indexing")).toBe("index");
  });

  it("builds fixed-size vectors and scores unrelated text at zero", () => {
    const a = keywordVector("cosine similarity ranks passages");
    expect(a).toHaveLength(KEYWORD_DIMENSIONS);
    expect(cosineSimilarity(a, keywordVector("cosine similarity"))).toBeGreaterThan(0.5);
    expect(cosineSimilarity(a, keywordVector("banana bread recipe"))).toBe(0);
  });

  it("finds the right section of the bundled sample", () => {
    const chunks = splitText(sample, "doc", "how-this-app-works.md");
    const vectors = keywordVectors(chunks.map((chunk) => chunk.content));
    chunks.forEach((chunk, index) => {
      chunk.embedding = vectors[index];
    });
    const [query] = keywordVectors(["Where do the API keys live?"]);
    const [top] = rankChunks(query, chunks, ["doc"], 4);
    expect(top.content).toContain("Cloudflare Worker secrets");
  });
});
