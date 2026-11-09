import { CHAT_MODEL } from "../shared/models";
import { encodeSse, takeSseEvents } from "../shared/sse";
import { HttpError } from "./errors";

const RESPONSES_URL = "https://api.x.ai/v1/responses";

interface GrokOutputPart {
  type?: string;
  text?: string;
}

interface GrokOutputItem {
  type?: string;
  content?: GrokOutputPart[];
}

interface GrokResponse {
  output_text?: string;
  output?: GrokOutputItem[];
  error?: { message?: string };
}

interface GrokStreamEvent {
  type?: string;
  delta?: string;
  error?: { message?: string };
}

/** Pull visible answer text out of one Responses API SSE payload. Reasoning deltas are ignored. */
export function deltasFromGrokEvent(data: string): { deltas: string[]; error?: string } {
  if (data === "[DONE]") return { deltas: [] };
  let parsed: GrokStreamEvent;
  try {
    parsed = JSON.parse(data) as GrokStreamEvent;
  } catch {
    return { deltas: [] };
  }
  if (parsed.error?.message) return { deltas: [], error: parsed.error.message };
  if (parsed.type === "response.output_text.delta" && typeof parsed.delta === "string" && parsed.delta.length > 0) {
    return { deltas: [parsed.delta] };
  }
  return { deltas: [] };
}

export function textFromGrokResponse(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as GrokResponse;
  if (typeof record.output_text === "string" && record.output_text.trim()) return record.output_text;
  const parts: string[] = [];
  for (const item of record.output ?? []) {
    if (item.type === "reasoning") continue;
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && part.text) parts.push(part.text);
    }
  }
  return parts.join("");
}

export async function completeText(
  apiKey: string,
  system: string,
  user: string,
  maxOutputTokens: number,
  fetchImpl: typeof fetch,
): Promise<string> {
  const response = await fetchImpl(RESPONSES_URL, {
    method: "POST",
    headers: grokHeaders(apiKey),
    body: JSON.stringify(requestBody(system, user, maxOutputTokens, false)),
  });
  if (!response.ok) throw await upstreamError(response);
  const payload = (await response.json()) as GrokResponse;
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
  return fetchImpl(RESPONSES_URL, {
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
    input: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    reasoning: { effort: "low" },
    temperature: 0.7,
    top_p: 0.95,
    max_output_tokens: maxOutputTokens,
    store: false,
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
