// Imports original posts from @kilian.io on Bluesky. Runs after the Mastodon
// importer so cross-posts can be merged (see lib/dedup.ts) — the duplicate is
// kept in state with merged_into set and surfaces as also_on on the host item.

import { fetchJson } from "../lib/http.ts";
import { isCrossPost } from "../lib/dedup.ts";
import { type FeedItem, loadState, saveState, statsPatch } from "../lib/model.ts";
import { mirrorMedia } from "../lib/media.ts";

const API = "https://public.api.bsky.app/xrpc";
const ACTOR = "kilian.io";

interface BskyRecord {
  text: string;
  createdAt: string;
  reply?: unknown;
  facets?: {
    index?: { byteStart: number; byteEnd: number };
    features?: { $type: string; uri?: string; did?: string; tag?: string }[];
  }[];
  embed?: {
    $type: string;
    external?: { uri: string };
    // link card nested inside a media post (app.bsky.embed.recordWithMedia)
    media?: { $type: string; external?: { uri: string } };
  };
}

interface BskyExternalView {
  uri: string;
  title?: string;
  description?: string;
  thumb?: string;
}

interface BskyPostView {
  uri: string;
  author: { handle: string };
  record: BskyRecord;
  embed?: {
    $type: string;
    images?: { fullsize: string; alt: string }[];
    external?: BskyExternalView;
    media?: {
      $type: string;
      images?: { fullsize: string; alt: string }[];
      external?: BskyExternalView;
    };
  };
  likeCount: number;
  repostCount: number;
  replyCount: number;
  quoteCount: number;
}

// All URLs a post references beyond its plain text: rich-text link facets
// and external (link card) embeds, which don't have to appear in the text.
export function recordLinks(record: BskyRecord): string[] {
  const links: string[] = [];
  for (const facet of record.facets ?? []) {
    for (const feature of facet.features ?? []) {
      if (feature.$type === "app.bsky.richtext.facet#link" && feature.uri) {
        links.push(feature.uri);
      }
    }
  }
  if (record.embed?.external?.uri) links.push(record.embed.external.uri);
  if (record.embed?.media?.external?.uri) links.push(record.embed.media.external.uri);
  return links;
}

interface BskyFeedItem {
  post: BskyPostView;
  reason?: unknown;
  reply?: unknown;
}

export function atUriToWebUrl(uri: string, handle: string): string {
  const rkey = uri.split("/").pop();
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function textToHtml(text: string): string {
  const linked = escapeHtml(text).replaceAll(
    /https?:\/\/[^\s<]+/g,
    (url) => `<a href="${url}" rel="nofollow noopener">${url}</a>`,
  );
  return `<p>${linked.replaceAll("\n", "<br>")}</p>`;
}

// Renders post text using its rich-text facets. Bluesky post text usually
// contains a *truncated* display form of links ("example.com/foo…") while the
// full URL only lives in the facet — render the full URL as the link text.
export function recordToHtml(record: BskyRecord): string {
  if (!record.facets?.length) return textToHtml(record.text);

  const bytes = new TextEncoder().encode(record.text);
  const decoder = new TextDecoder();
  const facets = record.facets
    .filter((facet) => facet.index)
    .sort((a, b) => a.index!.byteStart - b.index!.byteStart);

  let html = "";
  let cursor = 0;
  for (const facet of facets) {
    const { byteStart, byteEnd } = facet.index!;
    if (byteStart < cursor) continue; // overlapping facet — skip
    html += escapeHtml(decoder.decode(bytes.slice(cursor, byteStart)));
    const inner = decoder.decode(bytes.slice(byteStart, byteEnd));
    const feature = facet.features?.find((f) =>
      f.$type.startsWith("app.bsky.richtext.facet#")
    );
    if (feature?.$type === "app.bsky.richtext.facet#link" && feature.uri) {
      html += `<a href="${feature.uri}" rel="nofollow noopener">${escapeHtml(feature.uri)}</a>`;
    } else if (feature?.$type === "app.bsky.richtext.facet#mention" && feature.did) {
      html += `<a href="https://bsky.app/profile/${feature.did}" rel="nofollow noopener">${escapeHtml(inner)}</a>`;
    } else if (feature?.$type === "app.bsky.richtext.facet#tag" && feature.tag) {
      html += `<a href="https://bsky.app/hashtag/${encodeURIComponent(feature.tag)}" rel="nofollow noopener">${escapeHtml(inner)}</a>`;
    } else {
      html += escapeHtml(inner);
    }
    cursor = byteEnd;
  }
  html += escapeHtml(decoder.decode(bytes.slice(cursor)));
  return `<p>${html.replaceAll("\n", "<br>")}</p>`;
}

// jsonFeed-style link preview captured from the post's external embed view
export function externalCard(post: BskyPostView) {
  const external = post.embed?.external ?? post.embed?.media?.external;
  if (!external?.uri || external.uri.includes("kilko.de")) return undefined;
  return {
    url: external.uri,
    title: external.title || external.uri,
    description: external.description || undefined,
    image: external.thumb,
  };
}

export function mapPost(post: BskyPostView): FeedItem {
  const rkey = post.uri.split("/").pop()!;
  const card = externalCard(post);
  return {
    id: rkey,
    date: post.record.createdAt,
    url: atUriToWebUrl(post.uri, post.author.handle),
    content_html: recordToHtml(post.record),
    content_text: post.record.text,
    media: (post.embed?.images ?? post.embed?.media?.images)?.map((img) => ({
      url: img.fullsize,
      alt: img.alt || undefined,
    })),
    stats: {
      likes: post.likeCount,
      reposts: post.repostCount + post.quoteCount,
      replies: post.replyCount,
    },
    stats_updated: new Date().toISOString(),
    extra: { at_uri: post.uri, ...(card ? { card } : {}) },
  };
}

export function isFeedWorthy(item: BskyFeedItem): boolean {
  if (item.reason || item.reply || item.post.record.reply) return false;
  // loop guard — also covers link cards and facets whose URL isn't in the text
  if (item.post.record.text.includes("kilko.de")) return false;
  if (recordLinks(item.post.record).some((link) => link.includes("kilko.de"))) {
    return false;
  }
  return true;
}

export async function importBluesky(): Promise<void> {
  const state = loadState("bluesky");
  const mastodonItems = Object.values(loadState("mastodon").items);

  const response = await fetchJson<{ feed: BskyFeedItem[] }>(
    `${API}/app.bsky.feed.getAuthorFeed?actor=${ACTOR}&filter=posts_no_replies&limit=50`,
  );

  const fetched = new Set<string>();
  for (const feedItem of response.feed) {
    if (!isFeedWorthy(feedItem)) continue;
    const item = mapPost(feedItem.post);
    fetched.add(item.id);
    const existing = state.items[item.id];
    Object.assign(item, statsPatch(existing, item.stats!));
    item.merged_into = existing?.merged_into;
    item.interactions = existing?.interactions;
    const media = existing?.media?.some((m) => m.url.startsWith("/media/"))
      ? existing.media
      : item.media;
    item.media = media?.length ? await mirrorMedia("bluesky", item.id, media) : undefined;

    // Cross-post dedup: stable once made, so only decide for new items.
    if (!existing) {
      const twin = mastodonItems.find((m) =>
        !m.deleted && !m.merged_into && isCrossPost(m, item)
      );
      if (twin) item.merged_into = `mastodon/${twin.id}`;
    }
    state.items[item.id] = item;
  }

  if (response.feed.length > 0) {
    const dates = response.feed.map((f) => f.post.record.createdAt).sort();
    const oldest = dates[0];
    for (const item of Object.values(state.items)) {
      if (item.date >= oldest && !fetched.has(item.id)) item.deleted = true;
    }
  }

  saveState("bluesky", state);
  console.log(`bluesky: ${fetched.size} items in window`);
}

if (import.meta.main) await importBluesky();
