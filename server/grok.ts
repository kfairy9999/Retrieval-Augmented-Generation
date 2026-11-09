import { CHAT_MODEL } from "../shared/models";
import { encodeSse, takeSseEvents } from "../shared/sse";
import { HttpError } from "./errors";

const CHAT_URL = "https://api.x.ai/v1/chat/completions";

interface GrokChoice {
  delta?: { content?: string | null; reasoning_content?: string };
  message?: { content?: string | null; reasoning_content?: string };
}

interface GrokChatPayload {
  error?: { message?: string };
  choices?: GrokChoice[];
}

/**
 * Visible answer text from one chat-completions SSE payload.
 * Docs show reasoning in `delta.reasoning_content` and the answer in `delta.content`.
 * https://docs.x.ai/developers/model-capabilities/text/streaming
 */
export function deltasFromGrokEvent(data: string): { deltas: string[]; error?: string } {
  if (data === "[DONE]") return { deltas: [] };
  let parsed: GrokChatPayload;
  try {
    parsed = JSON.parse(data) as GrokChatPayload;
  } catch {
    return { deltas: [] };
  }
  if (parsed.error?.message) return { deltas: [], error: parsed.error.message };
  const content = parsed.choices?.[0]?.delta?.content;
  if (typeof content === "string" && content.length > 0) return { deltas: [content] };
  return { deltas: [] };
}

export function textFromGrokResponse(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const content = (payload as GrokChatPayload).choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

export async function completeText(
  apiKey: string,
  system: string,
  user: string,
  maxOutputTokens: number,
  fetchImpl: typeof fetch,
): Promise<string> {
  const response = await fetchImpl(CHAT_URL, {
    method: "POST",
    headers: grokHeaders(apiKey),
    body: JSON.stringify(requestBody(system, user, maxOutputTokens, false)),
  });
  if (!response.ok) throw await upstreamError(response);
  const payload = (await response.json()) as GrokChatPayload;
  if (payload.error?.message) {
    console.error(JSON.stringify({ message: "grok complete error", detail: payload.error.message.slice(0, 300) }));
    throw new HttpError(502, "The Grok API returned an error.");
  }
  return textFromGrokResponse(payload);
}

export function openAnswerStream(
  apiKey: string,
  system: string,
  user: string,
  maxOutputTokens: number,
  fetchImpl: typeof fetch,
): Promise<Response> {
  return fetchImpl(CHAT_URL, {
    method: "POST",
    headers: grokHeaders(apiKey),
    body: JSON.stringify(requestBody(system, user, maxOutputTokens, true)),
  });
}

export function proxyGrokStream(upstream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
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
            const { deltas, error } = deltasFromGrokEvent(event.data);
            if (error) {
              console.error(JSON.stringify({ message: "grok stream error", detail: error.slice(0, 300) }));
              controller.enqueue(encoder.encode(encodeSse({ error: "The Grok API returned an error." })));
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
          message: "grok stream failed",
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

function grokHeaders(apiKey: string): HeadersInit {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  };
}

function requestBody(system: string, user: string, maxOutputTokens: number, stream: boolean) {
  return {
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    reasoning_effort: "low",
    temperature: 0.7,
    top_p: 0.95,
    max_tokens: maxOutputTokens,
    stream,
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
    message: "grok request failed",
    status: response.status,
    detail: detail.slice(0, 300),
  }));
  if (response.status === 429) {
    return new HttpError(429, "The Grok API rate limit was reached. Wait a moment and try again.");
  }
  if (response.status === 401 || response.status === 403) {
    return new HttpError(502, "The Grok API rejected the server key.");
  }
  return new HttpError(502, "The Grok API request failed.");
}
