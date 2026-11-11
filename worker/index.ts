import { handleApi } from "../server/handler";

interface AssetBinding {
  fetch(request: Request): Promise<Response>;
}

export async function route(request: Request, env: { GEMINI_API_KEY?: string; XAI_API_KEY?: string; ASSETS: AssetBinding }): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) {
    return handleApi(request, { GEMINI_API_KEY: env.GEMINI_API_KEY, XAI_API_KEY: env.XAI_API_KEY });
  }
  return env.ASSETS.fetch(request);
}

export default {
  fetch(request, env) {
    return route(request, env);
  },
} satisfies ExportedHandler<Env>;
