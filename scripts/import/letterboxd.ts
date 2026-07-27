// Imports watched/rated films from letterboxd.com/kiliankoe via RSS.

import { fetchText } from "../lib/http.ts";
import { parseRssItems, type RssItem } from "../lib/rss.ts";
import { sanitizeHtml, stripHtml } from "../lib/sanitize.ts";
import { type FeedItem, loadState, saveState } from "../lib/model.ts";

const FEED_URL = "https://letterboxd.com/kiliankoe/rss/";

export function mapRssItem(item: RssItem): FeedItem | null {
  const {
    guid,
    link,
    pubDate,
    description = "",
    "letterboxd:filmTitle": filmTitle,
    "letterboxd:filmYear": filmYear,
    "letterboxd:memberRating": memberRating,
    "letterboxd:watchedDate": watchedDate,
    "letterboxd:rewatch": rewatch,
    "letterboxd:memberLike": memberLike,
    "tmdb:movieId": tmdbId,
  } = item;
  if (!link || !guid) return null;
  // list updates etc. — only actual diary entries carry a film title
  if (!filmTitle) return null;

  const date = watchedDate
    ? new Date(watchedDate).toISOString()
    : pubDate
    ? new Date(pubDate).toISOString()
    : undefined;
  if (!date) return null;

  const poster = description.match(/<img src="([^"]+)"/)?.[1];
  // strip the poster paragraph; it's rendered from media instead
  const text = sanitizeHtml(description.replaceAll(/<p><img[^>]*><\/p>/g, ""));
  return {
    id: guid.replaceAll(/[^\w-]+/g, "-"),
    date,
    url: link,
    title: filmYear ? `${filmTitle} (${filmYear})` : filmTitle,
    content_html: text || undefined,
    content_text: stripHtml(text),
    media: poster ? [{ url: poster, alt: filmTitle }] : undefined,
    extra: {
      ...(memberRating ? { rating: parseFloat(memberRating) } : {}),
      ...(rewatch === "Yes" ? { rewatch: true } : {}),
      ...(memberLike === "Yes" ? { liked: true } : {}),
      ...(tmdbId ? { tmdb_url: `https://www.themoviedb.org/movie/${tmdbId}` } : {}),
    },
  };
}

export async function importLetterboxd(): Promise<void> {
  const state = loadState("letterboxd");
  const xml = await fetchText(FEED_URL);
  const items = parseRssItems(xml, [
    "title",
    "link",
    "guid",
    "pubDate",
    "description",
    "letterboxd:filmTitle",
    "letterboxd:filmYear",
    "letterboxd:memberRating",
    "letterboxd:watchedDate",
    "letterboxd:rewatch",
    "letterboxd:memberLike",
    "tmdb:movieId",
  ]);

  let count = 0;
  for (const rssItem of items) {
    const item = mapRssItem(rssItem);
    if (!item) continue;
    state.items[item.id] = { ...state.items[item.id], ...item };
    count++;
  }

  saveState("letterboxd", state);
  console.log(`letterboxd: ${count} items in window`);
}

if (import.meta.main) await importLetterboxd();
