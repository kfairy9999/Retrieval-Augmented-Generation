import { CHAT_MODEL, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "../shared/models";
import { deltasFromGeminiEvent, encodeSse, takeSseEvents } from "../shared/sse";
import type { GeminiContent } from "./prompt";

const API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
  }
}

interface EmbeddingResponse {
  embeddings?: Array<{ values?: number[] }>;
}

export async function embedTexts(
  texts: string[],
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<number[][]> {
  const response = await fetchImpl(`${API_ROOT}/${EMBEDDING_MODEL}:batchEmbedContents`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      requests: texts.map((text) => ({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text }] },
        outputDimensionality: EMBEDDING_DIMENSIONS,
      })),
    }),
  });

  if (!response.ok) throw await upstreamError(response);

  const payload = (await response.json()) as EmbeddingResponse;
  const vectors = payload.embeddings?.map((item) => item.values ?? []) ?? [];
  if (vectors.length !== texts.length) {
    throw new HttpError(502, "The embedding service returned an unexpected response.");
  }

  const width = vectors[0]?.length ?? 0;
  if (width === 0 || vectors.some((vector) => vector.length !== width || vector.some((value) => !Number.isFinite(value)))) {
    throw new HttpError(502, "The embedding service returned an unexpected response.");
  }

  return vectors;
}

export async function generateText(
  apiKey: string,
  system: string,
  contents: GeminiContent[],
  maxOutputTokens: number,
  fetchImpl: typeof fetch,
): Promise<string> {
  const response = await fetchImpl(`${API_ROOT}/${CHAT_MODEL}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(requestBody(system, contents, maxOutputTokens)),
  });

  if (!response.ok) throw await upstreamError(response);
  const payload = await response.text();
  const { deltas, error } = deltasFromGeminiEvent(payload);
  if (error) {
    console.error(JSON.stringify({ message: "gemini generate error", detail: error.slice(0, 300) }));
    throw new HttpError(502, "The Gemini API returned an error.");
  }
  return deltas.join("");
}

export function streamAnswer(
  apiKey: string,
  system: string,
  contents: GeminiContent[],
  maxOutputTokens: number,
  fetchImpl: typeof fetch,
): Promise<Response> {
  return fetchImpl(`${API_ROOT}/${CHAT_MODEL}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(requestBody(system, contents, maxOutputTokens)),
  });
}

export function proxyGeminiStream(upstream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = upstream.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
          if (done && buffer.trim() && !buffer.endsWith("\n\n")) buffer += "\n\n";
          const parsed = takeSseEvents(buffer);
          buffer = done ? "" : parsed.rest;
          for (const event of parsed.events) {
            const { deltas, error } = deltasFromGeminiEvent(event.data);
            if (error) {
              console.error(JSON.stringify({ message: "gemini stream error", detail: error.slice(0, 300) }));
              controller.enqueue(encoder.encode(encodeSse({ error: "The Gemini API returned an error." })));
            }
            for (const delta of deltas) {
              controller.enqueue(encoder.encode(encodeSse({ delta })));
            }
          }
          if (done) {
            controller.enqueue(encoder.encode(encodeSse({ done: true })));
            controller.close();
            return;
          }
        }
      } catch (error) {
        console.error(JSON.stringify({
          message: "gemini stream failed",
          error: error instanceof Error ? error.message : String(error),
        }));
        controller.enqueue(encoder.encode(encodeSse({ error: "The response stream failed." })));
        controller.close();
      }
    },
    cancel() {
      return reader.cancel();
    },
  });
}

function requestBody(system: string, contents: GeminiContent[], maxOutputTokens: number) {
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: {
      maxOutputTokens,
      thinkingConfig: { thinkingLevel: "low" },
    },
  };
}

async function upstreamError(response: Response): Promise<HttpError> {
  let detail = "";
  try {
    const payload = (await response.json()) as { error?: { message?: string } };
    detail = payload.error?.message ?? "";
  } catch {
    detail = "";
  }
  console.error(JSON.stringify({
    message: "gemini request failed",
    status: response.status,
    detail: detail.slice(0, 300),
  }));

  if (response.status === 429) {
    return new HttpError(429, "The Gemini API rate limit was reached. Wait a moment and try again.");
  }
  if (response.status === 401 || response.status === 403) {
    return new HttpError(502, "The Gemini API rejected the server key.");
  }
  return new HttpError(502, "The Gemini API request failed.");
}
