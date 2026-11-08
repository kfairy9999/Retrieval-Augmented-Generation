import { describe, expect, it } from "vitest";
import { formatDocument, formatQuery } from "../shared/embeddingText";
import { linkCitations } from "../shared/citations";
import { deltasFromGeminiEvent, takeSseEvents } from "../shared/sse";
import { proxyGeminiStream } from "../server/gemini";
import { handleApi, type Limiters } from "../server/handler";
import { buildAnswerRequest, standaloneQuery } from "../server/prompt";
import { SlidingWindowLimiter } from "../server/rateLimit";
import { resolveSearchQuery } from "../src/lib/resolveQuery";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function limiters(limit = 10): Limiters {
  const now = () => 1_000;
  return {
    embed: new SlidingWindowLimiter(limit, 60_000, now),
    rewrite: new SlidingWindowLimiter(limit, 60_000, now),
    generate: new SlidingWindowLimiter(limit, 60_000, now),
  };
}

function post(path: string, body: unknown, extra?: HeadersInit): Request {
  return new Request(`http://local${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...extra },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("embedding text and citations", () => {
  it("formats documents and queries the way Gemini Embedding 2 expects", () => {
    expect(formatDocument("My|Notes\n", "alpha")).toBe("title: My Notes | text: alpha");
    expect(formatDocument("   ", "alpha")).toBe("title: none | text: alpha");
    expect(formatQuery("why?")).toBe("task: question answering | query: why?");
  });

  it("links in-range citations and leaves code alone", () => {
    const linked = linkCitations("See [1] and [9].\n```\nkeep [1]\n```\nUse `[2]` too.", 2);
    expect(linked).toContain("[1](#cite-1)");
    expect(linked).toContain("[9]");
    expect(linked).not.toContain("[9](#cite-9)");
    expect(linked).toContain("```\nkeep [1]\n```");
    expect(linked).toContain("`[2]`");
  });

  it("keeps the original question when rewrite fails", async () => {
    await expect(resolveSearchQuery("raw", false, () => Promise.reject(new Error("no")))).resolves.toBe("raw");
    await expect(resolveSearchQuery("raw", true, () => Promise.reject(new Error("no")))).resolves.toBe("raw");
    await expect(resolveSearchQuery("raw", true, () => Promise.resolve("  standalone  "))).resolves.toBe("standalone");
  });
});

describe("prompts and SSE", () => {
  it("numbers passages and tells the model they are untrusted", () => {
    const request = buildAnswerRequest("What color?", [
      { role: "user", content: "Earlier question" },
      { role: "model", content: "Earlier answer" },
    ], [
      { content: "The door is red.", source: "house.md", page: 2 },
    ]);
    expect(request.system).toMatch(/untrusted/i);
    expect(request.system).toMatch(/only the numbered passages/i);
    expect(request.contents).toHaveLength(1);
    expect(request.contents[0]?.role).toBe("user");
    const prompt = request.contents[0]?.parts[0]?.text ?? "";
    expect(prompt).toContain("[1] Source: house.md, page 2");
    expect(prompt).toContain("The door is red.");
    expect(prompt).toContain("What color?");
    expect(prompt).toContain("Earlier question");
  });

  it("takes the first line of a rewritten query", () => {
    expect(standaloneQuery('"plant energy storage"\nextra', "fallback")).toBe("plant energy storage");
    expect(standaloneQuery("   ", "fallback")).toBe("fallback");
  });

  it("drops thought parts and keeps text across split SSE frames", () => {
    const first = takeSseEvents('data: {"candidates":[{"content":{"parts":[{"thought":true,"text":"hidden"},{"text":"Hello"}]}}]}\n\n');
    expect(deltasFromGeminiEvent(first.events[0]!.data).deltas).toEqual(["Hello"]);
    const partial = takeSseEvents('data: {"text":');
    expect(partial.events).toEqual([]);
    expect(partial.rest).toContain("data:");
  });

  it("proxies a Gemini stream into answer deltas", async () => {
    const encoder = new TextEncoder();
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"candidates":[{"content":{"parts":[{"thought":true,"text":"secret"},{"text":"Hi"}]}}]}\n\n'));
        controller.enqueue(encoder.encode('data: {"candidates":[{"content":{"parts":[{"text":" there"}]}}]}\n\n'));
        controller.close();
      },
    });
    const text = await new Response(proxyGeminiStream(upstream)).text();
    expect(text).toContain('{"delta":"Hi"}');
    expect(text).toContain('{"delta":" there"}');
    expect(text).toContain('{"done":true}');
    expect(text).not.toContain("secret");
  });
});

describe("HTTP API", () => {
  it("reports whether a key is configured", async () => {
    const response = await handleApi(new Request("http://local/api/health"), { GEMINI_API_KEY: "" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, hasKey: false });
  });

  it("rejects unknown routes, methods, and non-JSON bodies", async () => {
    expect((await handleApi(new Request("http://local/api/nope"), {})).status).toBe(404);
    expect((await handleApi(new Request("http://local/api/embed"), {})).status).toBe(405);
    const response = await handleApi(new Request("http://local/api/embed", { method: "POST", body: "{}" }), {});
    expect(response.status).toBe(415);
  });

  it("rejects oversized bodies and missing keys", async () => {
    const tooBig = await handleApi(post("/api/embed", "x".repeat(130 * 1024)), { GEMINI_API_KEY: "test-key" }, { limiters: limiters() });
    expect(tooBig.status).toBe(413);

    const missing = await handleApi(post("/api/embed", { purpose: "query", texts: ["hi"] }), { GEMINI_API_KEY: "  " }, { limiters: limiters() });
    expect(missing.status).toBe(500);
    await expect(missing.json()).resolves.toMatchObject({ error: expect.stringContaining("GEMINI_API_KEY") });
  });

  it("rate limits a second call in the same window", async () => {
    const deps = {
      limiters: limiters(1),
      fetchImpl: async () => new Response(JSON.stringify({ embeddings: [{ values: [0.1, 0.2] }] }), { status: 200 }),
    };
    const body = { purpose: "query", texts: ["hi"] };
    const first = await handleApi(post("/api/embed", body), { GEMINI_API_KEY: "test-key" }, deps);
    const second = await handleApi(post("/api/embed", body), { GEMINI_API_KEY: "test-key" }, deps);
    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBeTruthy();
  });

  it("sends task-formatted embedding requests and does not put the key in the URL", async () => {
    let called = "";
    const response = await handleApi(post("/api/embed", {
      purpose: "document",
      title: "notes.md",
      texts: ["alpha"],
    }), { GEMINI_API_KEY: "super-secret" }, {
      limiters: limiters(),
      fetchImpl: async (input, init) => {
        called = String(input);
        const headers = new Headers(init?.headers);
        expect(headers.get("x-goog-api-key")).toBe("super-secret");
        const payload = JSON.parse(String(init?.body)) as { requests: Array<{ content: { parts: Array<{ text: string }> }; outputDimensionality: number }> };
        expect(payload.requests[0]?.content.parts[0]?.text).toBe("title: notes.md | text: alpha");
        expect(payload.requests[0]?.outputDimensionality).toBe(768);
        return new Response(JSON.stringify({ embeddings: [{ values: [0.2, 0.4] }] }), { status: 200 });
      },
    });
    expect(response.status).toBe(200);
    expect(called).not.toContain("super-secret");
    await expect(response.json()).resolves.toEqual({ embeddings: [[0.2, 0.4]] });
  });

  it("returns the question unchanged when there is no history", async () => {
    const response = await handleApi(post("/api/rewrite", { question: "What is RAG?", history: [] }), { GEMINI_API_KEY: "k" }, {
      limiters: limiters(),
      fetchImpl: () => Promise.reject(new Error("should not call Gemini")),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ query: "What is RAG?" });
  });

  it("streams an answer and skips model thoughts", async () => {
    const encoder = new TextEncoder();
    const response = await handleApi(post("/api/generate", {
      question: "What color is the door?",
      history: [{ role: "user", content: "Look at the notes." }],
      chunks: [{ content: "The door is red.", source: "house.md" }],
    }), { GEMINI_API_KEY: "k" }, {
      limiters: limiters(),
      fetchImpl: (_input, init) => {
        const payload = JSON.parse(String(init?.body)) as { systemInstruction: { parts: Array<{ text: string }> }; contents: Array<{ role: string }> };
        expect(payload.systemInstruction.parts[0]?.text).toMatch(/untrusted/i);
        expect(payload.contents.at(-1)?.role).toBe("user");
        return Promise.resolve(new Response(new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"candidates":[{"content":{"parts":[{"thought":true,"text":"plan"},{"text":"It is red [1]."}]}}]}\n\n'));
            controller.close();
          },
        }), { status: 200 }));
      },
    });
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const text = await response.text();
    expect(text).toContain("It is red [1].");
    expect(text).not.toContain("plan");
  });
});

describe("client boundary", () => {
  it("does not call Gemini or read the API key from the browser source", () => {
    const files = walk("src").filter((file) => /\.(ts|tsx)$/.test(file));
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      if (text.includes("generativelanguage.googleapis.com") || text.includes("GEMINI_API_KEY") || text.includes("process.env.API_KEY")) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
