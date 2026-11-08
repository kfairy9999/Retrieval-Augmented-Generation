import { formatDocument, formatQuery } from "../shared/embeddingText";
import { CHAT_MODEL, EMBEDDING_MODEL } from "../shared/models";
import { buildAnswerRequest, buildRewritePrompt, standaloneQuery, type CitedChunk, type HistoryTurn } from "./prompt";
import { embedTexts, generateText, HttpError, proxyGeminiStream, streamAnswer } from "./gemini";
import { clientKey, SlidingWindowLimiter } from "./rateLimit";

export interface ApiEnv {
  GEMINI_API_KEY?: string;
}

export interface Limiters {
  embed: SlidingWindowLimiter;
  rewrite: SlidingWindowLimiter;
  generate: SlidingWindowLimiter;
}

export interface HandlerDeps {
  fetchImpl?: typeof fetch;
  limiters?: Limiters;
}

const MAX_BODY_BYTES = 128 * 1024;
const MAX_TEXTS = 16;
const MAX_TEXT_CHARS = 4_000;
const MAX_QUERY_CHARS = 2_000;
const MAX_CHUNKS = 6;
const MAX_CHUNK_CHARS = 2_000;
const MAX_HISTORY = 8;
const MAX_HISTORY_CHARS = 2_000;
const MAX_TITLE_CHARS = 180;

const defaultLimiters: Limiters = {
  embed: new SlidingWindowLimiter(40, 60_000),
  rewrite: new SlidingWindowLimiter(12, 60_000),
  generate: new SlidingWindowLimiter(12, 60_000),
};

export async function handleApi(request: Request, env: ApiEnv, deps: HandlerDeps = {}): Promise<Response> {
  const url = new URL(request.url);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const limiters = deps.limiters ?? defaultLimiters;

  try {
    if (request.method === "GET" && url.pathname === "/api/health") {
      console.log(JSON.stringify({ message: "api request", route: url.pathname, method: request.method }));
      return json({
        ok: true,
        hasKey: Boolean(env.GEMINI_API_KEY),
        chatModel: CHAT_MODEL,
        embeddingModel: EMBEDDING_MODEL,
      });
    }

    if (url.pathname !== "/api/embed" && url.pathname !== "/api/rewrite" && url.pathname !== "/api/generate") {
      return json({ error: "Not found." }, 404);
    }
    console.log(JSON.stringify({ message: "api request", route: url.pathname, method: request.method }));
    if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return json({ error: "Content-Type must be application/json." }, 415);
    }

    const key = await clientKey(request);
    const route = url.pathname.slice("/api/".length) as "embed" | "rewrite" | "generate";
    const decision = limiters[route].check(key);
    if (!decision.ok) {
      return json(
        { error: `Too many requests. Try again in ${decision.retryAfterSec} seconds.` },
        429,
        { "retry-after": String(decision.retryAfterSec) },
      );
    }

    const apiKey = env.GEMINI_API_KEY?.trim() ?? "";
    if (!apiKey) {
      return json({ error: "The server is missing GEMINI_API_KEY." }, 500);
    }

    const body = await readJson(request);
    if (route === "embed") return await handleEmbed(body, apiKey, fetchImpl);
    if (route === "rewrite") return await handleRewrite(body, apiKey, fetchImpl);
    return await handleGenerate(body, apiKey, fetchImpl);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status, error.headers);
    console.error(JSON.stringify({
      message: "unhandled api error",
      error: error instanceof Error ? error.message : String(error),
    }));
    return json({ error: "Unexpected server error." }, 500);
  }
}

async function handleEmbed(body: unknown, apiKey: string, fetchImpl: typeof fetch): Promise<Response> {
  const record = asRecord(body);
  const purpose = record.purpose;
  if (purpose !== "document" && purpose !== "query") {
    throw new HttpError(400, "purpose must be document or query.");
  }
  const texts = stringArray(record.texts, "texts");
  if (texts.length === 0 || texts.length > MAX_TEXTS) {
    throw new HttpError(400, `Send between 1 and ${MAX_TEXTS} texts.`);
  }
  if (texts.some((text) => text.trim().length === 0 || text.length > MAX_TEXT_CHARS)) {
    throw new HttpError(400, `Each text must be 1 to ${MAX_TEXT_CHARS} characters.`);
  }

  const title = typeof record.title === "string" ? record.title.slice(0, MAX_TITLE_CHARS) : "";
  const formatted = texts.map((text) => (purpose === "document" ? formatDocument(title, text) : formatQuery(text)));
  const embeddings = await embedTexts(formatted, apiKey, fetchImpl);
  return json({ embeddings });
}

async function handleRewrite(body: unknown, apiKey: string, fetchImpl: typeof fetch): Promise<Response> {
  const record = asRecord(body);
  const question = requiredString(record.question, "question", MAX_QUERY_CHARS);
  const history = parseHistory(record.history);
  if (history.length === 0) return json({ query: question });

  const text = await generateText(apiKey, "You rewrite questions into standalone search queries.", [
    { role: "user", parts: [{ text: buildRewritePrompt(question, history) }] },
  ], 256, fetchImpl);
  return json({ query: standaloneQuery(text, question) });
}

async function handleGenerate(body: unknown, apiKey: string, fetchImpl: typeof fetch): Promise<Response> {
  const record = asRecord(body);
  const question = requiredString(record.question, "question", MAX_QUERY_CHARS);
  const history = parseHistory(record.history);
  const chunks = parseChunks(record.chunks);
  const { system, contents } = buildAnswerRequest(question, history, chunks);
  const upstream = await streamAnswer(apiKey, system, contents, 2048, fetchImpl);

  if (!upstream.ok || !upstream.body) {
    const message = upstream.ok
      ? "The Gemini API returned an empty stream."
      : (await errorMessage(upstream));
    return json({ error: message }, upstream.ok ? 502 : upstream.status === 429 ? 429 : 502);
  }

  return new Response(proxyGeminiStream(upstream.body), {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: { message?: string } };
    console.error(JSON.stringify({
      message: "gemini stream open failed",
      status: response.status,
      detail: (payload.error?.message ?? "").slice(0, 300),
    }));
  } catch {
    console.error(JSON.stringify({ message: "gemini stream open failed", status: response.status }));
  }
  if (response.status === 429) return "The Gemini API rate limit was reached. Wait a moment and try again.";
  if (response.status === 401 || response.status === 403) return "The Gemini API rejected the server key.";
  return "The Gemini API request failed.";
}

function parseHistory(value: unknown): HistoryTurn[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new HttpError(400, "history must be an array.");
  if (value.length > MAX_HISTORY) throw new HttpError(400, `history can include at most ${MAX_HISTORY} turns.`);
  return value.map((item) => {
    const record = asRecord(item);
    if (record.role !== "user" && record.role !== "model") {
      throw new HttpError(400, "history roles must be user or model.");
    }
    return { role: record.role, content: requiredString(record.content, "history content", MAX_HISTORY_CHARS) };
  });
}

function parseChunks(value: unknown): CitedChunk[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_CHUNKS) {
    throw new HttpError(400, `Send between 1 and ${MAX_CHUNKS} passages.`);
  }
  return value.map((item) => {
    const record = asRecord(item);
    const page = record.page;
    if (page != null && (!Number.isInteger(page) || Number(page) < 1 || Number(page) > 10000)) {
      throw new HttpError(400, "page must be a positive integer.");
    }
    return {
      content: requiredString(record.content, "chunk content", MAX_CHUNK_CHARS),
      source: requiredString(record.source, "chunk source", MAX_TITLE_CHARS),
      ...(typeof page === "number" ? { page } : {}),
    };
  });
}

async function readJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new HttpError(413, "Request body is too large.");
  }
  if (!request.body) throw new HttpError(400, "Request body must be JSON.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new HttpError(413, "Request body is too large.");
    }
    chunks.push(value);
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(combined));
  } catch {
    throw new HttpError(400, "Request body must be JSON.");
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "Request body must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string, max: number): string {
  if (typeof value !== "string") throw new HttpError(400, `${label} must be a string.`);
  const trimmed = value.trim();
  if (!trimmed || value.length > max) throw new HttpError(400, `${label} must be 1 to ${max} characters.`);
  return value;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new HttpError(400, `${label} must be an array of strings.`);
  }
  return value as string[];
}

function json(data: unknown, status = 200, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extra,
    },
  });
}
