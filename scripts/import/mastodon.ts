// Imports original public posts from @kilian@chaos.social.

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

export function mapStatus(status: MastodonStatus): FeedItem {
  const content_html = sanitizeHtml(status.content);
  const card = status.card;
  const hasCard = card?.type === "link" && card.url && !card.url.includes("kilko.de");
  return {
    extra: hasCard
      ? {
        card: {
          url: card!.url,
          title: card!.title || card!.url,
          description: card!.description || undefined,
          image: card!.image ?? undefined,
        },
      }
      : undefined,
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
  if (status.reblog || status.in_reply_to_id) return false;
  // loop guard: never re-import posts that reference the site itself
  if (status.content.includes("kilko.de")) return false;
  return true;
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

  saveState("mastodon", state);
  console.log(`mastodon: ${fetched.size} items in window`);
}

if (import.meta.main) await importMastodon();
