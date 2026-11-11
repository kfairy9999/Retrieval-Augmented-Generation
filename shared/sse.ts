export interface SseMessage {
  data: string;
}

export function takeSseEvents(buffer: string): { events: SseMessage[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  const rest = parts.pop() ?? "";
  const events: SseMessage[] = [];

  for (const part of parts) {
    const dataLines: string[] = [];
    for (const line of part.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length > 0) events.push({ data: dataLines.join("\n") });
  }

  return { events, rest };
}

interface GeminiPart {
  text?: string;
  thought?: boolean;
}

interface GeminiEvent {
  error?: { message?: string };
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
}

/** Pull visible text out of one Gemini stream event. Thought parts are dropped. */
export function deltasFromGeminiEvent(data: string): { deltas: string[]; error?: string } {
  let parsed: GeminiEvent;
  try {
    parsed = JSON.parse(data) as GeminiEvent;
  } catch {
    return { deltas: [] };
  }

  if (parsed.error) {
    return { deltas: [], error: parsed.error.message || "Gemini request failed." };
  }

  const parts = parsed.candidates?.[0]?.content?.parts ?? [];
  const deltas: string[] = [];
  for (const part of parts) {
    if (part.thought) continue;
    if (typeof part.text === "string" && part.text.length > 0) deltas.push(part.text);
  }
  return { deltas };
}

export function encodeSse(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}
