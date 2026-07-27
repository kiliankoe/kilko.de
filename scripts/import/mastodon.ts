// Imports original public posts from @kilian@chaos.social. Self-reply
// threads and "RE: <own-post-url>" quote posts collapse into one feed item:
// the thread root hosts, continuations get thread_root set and render as
// segments (see assembleThreads).

import { fetchJson } from "../lib/http.ts";
import { sanitizeHtml, stripHtml } from "../lib/sanitize.ts";
import { type FeedItem, loadState, saveState, statsPatch } from "../lib/model.ts";
import { mirrorMedia } from "../lib/media.ts";

const INSTANCE = "https://chaos.social";
const ACCOUNT = "kilian";

interface MastodonStatus {
  id: string;
  created_at: string;
  url: string;
  visibility: string;
  content: string;
  in_reply_to_id: string | null;
  in_reply_to_account_id: string | null;
  account: { id: string };
  reblog: unknown | null;
  favourites_count: number;
  reblogs_count: number;
  replies_count: number;
  media_attachments: {
    type: string;
    url: string;
    description: string | null;
  }[];
  card?: {
    url: string;
    title: string;
    description: string;
    image: string | null;
    type: string;
  } | null;
}

// chaos.social-style quote posts start with a paragraph "RE: <link to post>";
// when the link targets one of our own statuses it's a thread continuation.
export function reQuoteTarget(contentHtml: string): string | undefined {
  return contentHtml.match(
    /^\s*<p>RE:\s*<a href="https?:\/\/[^"]+\/(\d+)"/,
  )?.[1];
}

export function stripReQuotePrefix(contentHtml: string): string {
  return contentHtml.replace(/^\s*<p>RE:\s*<a[^>]*>.*?<\/a>\s*<\/p>\s*/, "");
}

export function mapStatus(status: MastodonStatus): FeedItem {
  const content_html = sanitizeHtml(status.content);
  const card = status.card;
  const hasCard = card?.type === "link" && card.url && !card.url.includes("kilko.de");
  const selfReply = status.in_reply_to_id &&
    status.in_reply_to_account_id === status.account.id;
  const reTarget = reQuoteTarget(content_html);
  const extra = {
    ...(hasCard
      ? {
        card: {
          url: card!.url,
          title: card!.title || card!.url,
          description: card!.description || undefined,
          image: card!.image ?? undefined,
        },
      }
      : {}),
    ...(selfReply ? { in_reply_to: status.in_reply_to_id } : {}),
    ...(reTarget ? { re_target: reTarget } : {}),
  };
  return {
    extra: Object.keys(extra).length ? extra : undefined,
    id: status.id,
    date: status.created_at,
    url: status.url,
    content_html,
    content_text: stripHtml(content_html),
    media: status.media_attachments
      .filter((m) => m.type === "image" || m.type === "gifv" || m.type === "video")
      .map((m) => ({ url: m.url, alt: m.description ?? undefined })),
    stats: {
      favs: status.favourites_count,
      boosts: status.reblogs_count,
      replies: status.replies_count,
    },
    stats_updated: new Date().toISOString(),
  };
}

export function isFeedWorthy(status: MastodonStatus): boolean {
  if (status.visibility !== "public") return false;
  if (status.reblog) return false;
  // replies to *other* accounts stay out; self-replies are thread segments
  // (compare account ids, not handles — threader learned that the hard way)
  if (
    status.in_reply_to_id &&
    status.in_reply_to_account_id !== status.account.id
  ) return false;
  // loop guard: never re-import posts that reference the site itself
  if (status.content.includes("kilko.de")) return false;
  return true;
}

// Marks thread continuations with the id of their ultimate root. Recomputed
// wholesale each run; chain walks carry a visited set because reply chains
// can loop (another threader lesson).
export function assembleThreads(items: Record<string, FeedItem>): void {
  for (const item of Object.values(items)) item.thread_root = undefined;

  const parentOf = (item: FeedItem): FeedItem | undefined => {
    const parentId = (item.extra?.in_reply_to ?? item.extra?.re_target) as
      | string
      | undefined;
    if (!parentId) return undefined;
    const parent = items[parentId];
    return parent && !parent.deleted ? parent : undefined;
  };

  for (const item of Object.values(items)) {
    if (item.deleted) continue;
    const visited = new Set([item.id]);
    let root: FeedItem | undefined;
    let cursor = parentOf(item);
    while (cursor && !visited.has(cursor.id)) {
      visited.add(cursor.id);
      root = cursor;
      cursor = parentOf(cursor);
    }
    if (root) item.thread_root = root.id;
  }
}

export async function importMastodon(): Promise<void> {
  const state = loadState("mastodon");

  let accountId = state.meta?.account_id as string | undefined;
  if (!accountId) {
    const account = await fetchJson<{ id: string }>(
      `${INSTANCE}/api/v1/accounts/lookup?acct=${ACCOUNT}`,
    );
    accountId = account.id;
    state.meta = { ...state.meta, account_id: accountId };
  }

  // exclude_replies keeps self-replies — exactly what thread merging needs
  const statuses = await fetchJson<MastodonStatus[]>(
    `${INSTANCE}/api/v1/accounts/${accountId}/statuses?exclude_replies=true&exclude_reblogs=true&limit=40`,
  );

  const fetched = new Set<string>();
  for (const status of statuses) {
    if (!isFeedWorthy(status)) continue;
    fetched.add(status.id);
    const existing = state.items[status.id];
    const mapped = mapStatus(status);
    // keep already-mirrored local media paths across upserts
    const media = existing?.media?.some((m) => m.url.startsWith("/media/"))
      ? existing.media
      : mapped.media;
    state.items[status.id] = {
      ...mapped,
      media: media?.length ? await mirrorMedia("mastodon", status.id, media) : undefined,
      ...statsPatch(existing, mapped.stats!),
      merged_into: existing?.merged_into,
      interactions: existing?.interactions,
    };
  }

  // Anything inside the fetched window that vanished upstream was deleted.
  if (statuses.length > 0) {
    const oldest = statuses[statuses.length - 1].created_at;
    for (const item of Object.values(state.items)) {
      if (item.date >= oldest && !fetched.has(item.id)) item.deleted = true;
    }
  }

  assembleThreads(state.items);
  saveState("mastodon", state);
  console.log(`mastodon: ${fetched.size} items in window`);
}

if (import.meta.main) await importMastodon();
