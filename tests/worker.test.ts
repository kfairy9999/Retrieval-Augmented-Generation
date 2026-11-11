import { describe, expect, it } from "vitest";
import { route } from "../worker/index";

describe("worker routing", () => {
  it("handles API routes and serves other paths from assets", async () => {
    const health = await route(new Request("https://demo.example/api/health"), {
      GEMINI_API_KEY: "",
      XAI_API_KEY: "",
      ASSETS: { fetch: () => Promise.reject(new Error("assets should not be called")) },
    });
    expect(health.status).toBe(200);

    const asset = await route(new Request("https://demo.example/"), {
      GEMINI_API_KEY: "",
      XAI_API_KEY: "",
      ASSETS: { fetch: () => Promise.resolve(new Response("index")) },
    });
    expect(await asset.text()).toBe("index");
  });
});
