function linkPlain(text: string, sourceCount: number): string {
  const parts = text.split(/(`[^`]*`)/g);
  return parts
    .map((part) => {
      if (part.startsWith("`") && part.endsWith("`")) return part;
      return part.replace(/\[(\d+)\](?!\()/g, (match, raw: string) => {
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 1 || n > sourceCount) return match;
        return `[${n}](#cite-${n})`;
      });
    })
    .join("");
}

/** Turn in-range [n] markers into links. Leaves fenced and inline code alone. */
export function linkCitations(text: string, sourceCount: number): string {
  if (sourceCount < 1 || !text) return text;
  const fence = /```[\s\S]*?```/g;
  let out = "";
  let last = 0;
  for (const match of text.matchAll(fence)) {
    const index = match.index ?? 0;
    out += linkPlain(text.slice(last, index), sourceCount);
    out += match[0];
    last = index + match[0].length;
  }
  out += linkPlain(text.slice(last), sourceCount);
  return out;
}

export function citationIndexFromHref(href: string | undefined): number | null {
  if (!href?.startsWith("#cite-")) return null;
  const n = Number(href.slice("#cite-".length));
  return Number.isInteger(n) && n > 0 ? n : null;
}
