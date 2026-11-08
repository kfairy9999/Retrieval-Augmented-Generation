import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { handleApi } from "./handler";

const MAX_BODY_BYTES = 128 * 1024;

async function toWebRequest(req: IncomingMessage, url: string): Promise<Request | Response> {
  const method = req.method ?? "GET";
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }

  if (method === "GET" || method === "HEAD") {
    return new Request(url, { method, headers });
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ error: "Request body is too large." }), {
        status: 413,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
    chunks.push(buffer);
  }

  return new Request(url, { method, headers, body: Buffer.concat(chunks) });
}

async function writeResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key === "content-length") return;
    res.setHeader(key, value);
  });

  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    res.setHeader("x-accel-buffering", "no");
    res.flushHeaders();
  }

  if (!response.body) {
    res.end();
    return;
  }

  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!res.write(Buffer.from(value))) {
      await new Promise((resolve) => res.once("drain", resolve));
    }
  }
  res.end();
}

export function apiDevPlugin(apiKey: string): Plugin {
  return {
    name: "local-gemini-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void serve(req, res, next, apiKey);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void serve(req, res, next, apiKey);
      });
    },
  };
}

async function serve(
  req: IncomingMessage,
  res: ServerResponse,
  next: (error?: unknown) => void,
  apiKey: string,
): Promise<void> {
  const path = req.url ?? "";
  if (!path.startsWith("/api/")) {
    next();
    return;
  }

  try {
    const host = req.headers.host ?? "localhost";
    const request = await toWebRequest(req, `http://${host}${path}`);
    const response = request instanceof Response
      ? request
      : await handleApi(request, { GEMINI_API_KEY: apiKey });
    await writeResponse(res, response);
  } catch (error) {
    console.error(JSON.stringify({
      message: "local api failed",
      error: error instanceof Error ? error.message : String(error),
    }));
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json; charset=utf-8");
    }
    res.end(JSON.stringify({ error: "Local API failed." }));
  }
}
