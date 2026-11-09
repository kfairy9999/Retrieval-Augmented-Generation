import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import { apiDevPlugin } from "./server/devApi";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const geminiApiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
  const xaiApiKey = env.XAI_API_KEY || process.env.XAI_API_KEY || "";

  return {
    plugins: [react(), tailwindcss(), apiDevPlugin({ geminiApiKey, xaiApiKey })],
    server: {
      port: 3000,
      host: "0.0.0.0",
    },
    preview: {
      port: 3000,
      host: "0.0.0.0",
    },
    test: {
      environment: "node",
      include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    },
  };
});
