import { existsSync, readFileSync } from "node:fs";
import { embedTexts } from "../server/gemini";
import { formatDocument, formatQuery } from "../shared/embeddingText";
import { offlineRetrievalChecks } from "../src/lib/retrievalEval";
import { rankChunks } from "../src/lib/rag";
import type { DocumentChunk } from "../src/types";

const offline = offlineRetrievalChecks();
for (const check of offline) {
  console.log(`${check.passed ? "PASS" : "FAIL"}  ${check.name} — ${check.detail}`);
}
if (offline.some((check) => !check.passed)) process.exit(1);

const apiKey = loadKey();
if (!apiKey) {
  console.log("SKIP  live embedding eval — GEMINI_API_KEY is not set.");
  process.exit(0);
}

const passages = [
  { source: "plants.md", text: "Photosynthesis converts sunlight into chemical energy stored in glucose." },
  { source: "volcano.md", text: "The 1991 eruption of Mount Pinatubo cooled global temperatures for several years." },
  { source: "sort.md", text: "Quicksort partitions an array around a pivot and sorts the two sides recursively." },
];
const question = "How do plants store energy from sunlight?";

const documentVectors = await embedTexts(
  passages.map((passage) => formatDocument(passage.source, passage.text)),
  apiKey,
  fetch,
);
const [queryVector] = await embedTexts([formatQuery(question)], apiKey, fetch);
const chunks: DocumentChunk[] = passages.map((passage, index) => ({
  id: String(index),
  docId: passage.source,
  content: passage.text,
  metadata: { source: passage.source, start: 0, end: passage.text.length },
  embedding: documentVectors[index],
}));
const ranked = rankChunks(queryVector, chunks, passages.map((passage) => passage.source), 3);
const top = ranked[0];
console.log("LIVE  ranking:");
for (const hit of ranked) console.log(`      ${hit.score.toFixed(3)}  ${hit.metadata.source}`);

if (top?.metadata.source !== "plants.md") {
  console.error("FAIL  live embedding eval expected plants.md at rank 1.");
  process.exit(1);
}
console.log("PASS  live embedding eval");

function loadKey(): string {
  if (process.env.GEMINI_API_KEY?.trim()) return process.env.GEMINI_API_KEY.trim();
  if (!existsSync(".env")) return "";
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    if (trimmed.slice(0, eq).trim() !== "GEMINI_API_KEY") continue;
    return trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return "";
}
