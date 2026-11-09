import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "../shared/models";
import { HttpError } from "./errors";

const API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";

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

async function upstreamError(response: Response): Promise<HttpError> {
  let detail = "";
  try {
    const payload = (await response.json()) as { error?: { message?: string } };
    detail = payload.error?.message ?? "";
  } catch {
    detail = "";
  }
  console.error(JSON.stringify({
    message: "gemini embedding failed",
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
