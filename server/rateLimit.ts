interface Hit {
  timestamps: number[];
}

/**
 * Per-isolate sliding window. On Cloudflare this is not a global limit:
 * each Worker isolate keeps its own map.
 */
export class SlidingWindowLimiter {
  private hits = new Map<string, Hit>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
    private readonly maxKeys = 5000,
  ) {}

  check(key: string): { ok: true } | { ok: false; retryAfterSec: number } {
    const time = this.now();
    const start = time - this.windowMs;
    const entry = this.hits.get(key);
    const recent = (entry?.timestamps ?? []).filter((stamp) => stamp > start);

    if (recent.length >= this.limit) {
      const retryAfterSec = Math.max(1, Math.ceil((recent[0] + this.windowMs - time) / 1000));
      this.hits.set(key, { timestamps: recent });
      return { ok: false, retryAfterSec };
    }

    recent.push(time);
    if (!entry && this.hits.size >= this.maxKeys) {
      const oldest = this.hits.keys().next().value;
      if (oldest) this.hits.delete(oldest);
    }
    this.hits.set(key, { timestamps: recent });
    return { ok: true };
  }
}

export async function clientKey(request: Request): Promise<string> {
  const ip = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "local";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return [...new Uint8Array(digest)].slice(0, 8).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
