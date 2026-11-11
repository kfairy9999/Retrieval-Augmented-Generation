#!/usr/bin/env bash
# Build the client and deploy the Worker plus static assets.
# This does not set secrets. Run `npx wrangler secret put GEMINI_API_KEY` first.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
npx wrangler deploy
