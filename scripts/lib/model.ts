// Shared shape for all imported feed items. data/<source>.json is the
// canonical state; markdown under content/feed/ is regenerated from it.

// Shaped like webmention.io's jf2 entries so templates can render native
// interactions and webmentions with the same markup.
export interface Interaction {
  author: { name: string; photo?: string; url?: string };
  url?: string;
  published?: string | null;
  content_html?: string;
}

export interface Interactions {
  likes: Interaction[];
  reposts: Interaction[];
  replies: Interaction[];
}

export interface FeedItem {
  id: string;
  date: string; // ISO 8601
  url: string; // canonical URL on the origin network
  title?: string;
  content_html?: string; // sanitized at import time
  content_text?: string; // plain text, used for cross-post dedup
  media?: { url: string; alt?: string }[];
  stats?: Record<string, number>;
  stats_updated?: string;
  interactions?: Interactions; // avatar lists + replies, refreshed with stats
  // Set when the same content was posted on another network too; this item
  // then represents both and the counterpart is tombstoned via merged_into.
  also_on?: { network: string; url: string; stats?: Record<string, number> };
  merged_into?: string; // id of the item (in another source) representing this one
  // Same-source collapse (e.g. a finished-reading absorbed by its rating):
  // no markdown is generated and no also_on entry appears anywhere.
  collapsed_into?: string;
  deleted?: boolean; // upstream deletion → no markdown is generated
  extra?: Record<string, unknown>; // source-specific fields (rating, repo, …)
}

export interface SourceState {
  items: Record<string, FeedItem>;
  // free-form per-source cache (e.g. resolved account ids)
  meta?: Record<string, unknown>;
}

// Keeps the old stats_updated timestamp when counts didn't change, so
// repeated import runs don't churn the generated files (and git history).
export function statsPatch(
  existing: FeedItem | undefined,
  fresh: Record<string, number>,
): Pick<FeedItem, "stats" | "stats_updated"> {
  if (existing?.stats && JSON.stringify(existing.stats) === JSON.stringify(fresh)) {
    return { stats: existing.stats, stats_updated: existing.stats_updated };
  }
  return { stats: fresh, stats_updated: new Date().toISOString() };
}

export function loadState(source: string): SourceState {
  const path = new URL(`../../data/${source}.json`, import.meta.url);
  try {
    return JSON.parse(Deno.readTextFileSync(path));
  } catch (_) {
    return { items: {} };
  }
}

export function saveState(source: string, state: SourceState): void {
  const path = new URL(`../../data/${source}.json`, import.meta.url);
  Deno.writeTextFileSync(path, JSON.stringify(state, null, 2) + "\n");
}
