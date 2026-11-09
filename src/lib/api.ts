import { takeSseEvents } from "../../shared/sse";
import type { Message } from "../types";

export interface Health {
  ok: boolean;
  hasEmbeddingKey: boolean;
  hasChatKey: boolean;
  chatModel: string;
  embeddingModel: string;
}

export interface HistoryTurn {
  role: "user" | "model";
  content: string;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload as T;
}

export async function fetchHealth(): Promise<Health> {
  const response = await fetch("/api/health");
  if (!response.ok) throw new Error("The local API is unreachable.");
  return response.json() as Promise<Health>;
}

export async function embedTexts(
  texts: string[],
  purpose: "document" | "query",
  title?: string,
): Promise<number[][]> {
  const payload = await postJson<{ embeddings: number[][] }>("/api/embed", { texts, purpose, title });
  return payload.embeddings;
}

export async function rewriteQuery(question: string, history: HistoryTurn[]): Promise<string> {
  const payload = await postJson<{ query: string }>("/api/rewrite", { question, history });
  return payload.query;
}

export function historyFromMessages(messages: Message[]): HistoryTurn[] {
  return messages
    .filter((message) => message.status !== "retrieving" && message.status !== "writing" && message.content.trim())
    .slice(-8)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, 2000),
    }));
}

export async function streamAnswer(
  body: {
    question: string;
    history: HistoryTurn[];
    chunks: Array<{ content: string; source: string; page?: number }>;
  },
  onDelta: (delta: string) => void,
): Promise<void> {
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || `Request failed (${response.status}).`);
  }
  if (!response.body) throw new Error("The server returned an empty stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    if (done && buffer.trim() && !buffer.endsWith("\n\n")) buffer += "\n\n";
    const parsed = takeSseEvents(buffer);
    buffer = done ? "" : parsed.rest;
    for (const event of parsed.events) {
      const payload = JSON.parse(event.data) as { delta?: string; error?: string };
      if (payload.error) throw new Error(payload.error);
      if (payload.delta) onDelta(payload.delta);
    }
    if (done) break;
  }
}
