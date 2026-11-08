import { rankChunks } from "./rag";
import type { DocumentChunk } from "../types";

export interface EvalCheck {
  name: string;
  passed: boolean;
  detail: string;
}

function chunk(id: string, docId: string, source: string, embedding: number[], start = 0): DocumentChunk {
  return {
    id,
    docId,
    content: source,
    metadata: { source, start, end: start + 10 },
    embedding,
  };
}

export function offlineRetrievalChecks(): EvalCheck[] {
  const plants = chunk("1", "plants", "plants.md", [1, 0, 0], 0);
  const volcano = chunk("2", "volcano", "volcano.md", [0, 1, 0], 20);
  const sameScoreLater = chunk("3", "plants", "plants-late.md", [1, 0, 0], 50);
  const missing = chunk("4", "plants", "empty.md", [], 5);
  missing.embedding = undefined;
  const corpus = [volcano, sameScoreLater, plants, missing];

  const ranked = rankChunks([1, 0, 0], corpus, ["plants", "volcano"], 3);
  const filtered = rankChunks([1, 0, 0], corpus, ["volcano"], 3);
  const none = rankChunks([1, 0, 0], corpus, [], 3);

  return [
    {
      name: "nearest vector ranks first",
      passed: ranked[0]?.metadata.source === "plants.md",
      detail: `top source was ${ranked[0]?.metadata.source ?? "none"}`,
    },
    {
      name: "ties break toward the earlier chunk",
      passed: ranked[0]?.id === "1" && ranked[1]?.id === "3",
      detail: `order was ${ranked.map((item) => item.id).join(",")}`,
    },
    {
      name: "a chunk without an embedding is skipped",
      passed: ranked.every((item) => item.id !== "4"),
      detail: `ids were ${ranked.map((item) => item.id).join(",")}`,
    },
    {
      name: "document filter excludes other files",
      passed: filtered.length === 1 && filtered[0]?.metadata.source === "volcano.md",
      detail: `filtered sources were ${filtered.map((hit) => hit.metadata.source).join(",") || "none"}`,
    },
    {
      name: "an empty selection returns nothing",
      passed: none.length === 0,
      detail: `hits ${none.length}`,
    },
  ];
}
