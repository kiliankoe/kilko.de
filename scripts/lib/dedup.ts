// Cross-post detection: the same text posted to both Mastodon and Bluesky
// should appear only once in the feed.

const WINDOW_MS = 30 * 60 * 1000;

export function normalizeText(text: string): string {
  return text
    .replaceAll(/https?:\/\/\S+/g, " ") // URLs differ per network (shorteners, tracking)
    .replaceAll(/@[\w.-]+(@[\w.-]+)?/g, " ") // mentions resolve differently
    .replaceAll("#", " ")
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}\s]/gu, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

// Token containment: robust against one side being truncated ("…" crossposts).
export function similarity(a: string, b: string): number {
  const tokensA = new Set(normalizeText(a).split(" ").filter(Boolean));
  const tokensB = new Set(normalizeText(b).split(" ").filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let common = 0;
  for (const token of tokensA) if (tokensB.has(token)) common++;
  return common / Math.min(tokensA.size, tokensB.size);
}

export function isCrossPost(
  a: { date: string; content_text?: string },
  b: { date: string; content_text?: string },
): boolean {
  if (!a.content_text || !b.content_text) return false;
  const dt = Math.abs(new Date(a.date).getTime() - new Date(b.date).getTime());
  if (dt > WINDOW_MS) return false;
  return similarity(a.content_text, b.content_text) >= 0.9;
}
