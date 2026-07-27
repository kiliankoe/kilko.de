// Imports reading activity from kilian@bookwyrm.social via the public RSS
// feed. Only ratings/reviews and finished-reading make it into the feed;
// started-reading, want-to-read, and quotes are noise. When a rating and a
// finished-reading of the same book land close together they collapse into
// one item (the rating hosts, enriched with the author from the finished
// status).

import { fetchJson, fetchText } from "../lib/http.ts";
import { parseRssItems, type RssItem } from "../lib/rss.ts";
import { sanitizeHtml, stripHtml } from "../lib/sanitize.ts";
import { escapeHtml } from "./bluesky.ts";
import { type FeedItem, loadState, saveState } from "../lib/model.ts";

const FEED_URL = "https://bookwyrm.social/user/kilian/rss";
const COLLAPSE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

// "Compulsory by Martha Wells\n\n(The Murderbot Diaries, #0.5)" → strip the
// series suffix, it belongs to the edition, not the feed item
function cleanAuthor(author: string): string {
  return author.replace(/\s*\(.+\)\s*$/, "").trim();
}

export function mapRssItem(item: RssItem): FeedItem | null {
  const { link, guid, pubDate, description = "" } = item;
  const title = (item.title ?? "").replaceAll(/\s+/g, " ").trim();
  if (!link || !pubDate) return null;
  if (/(started reading|wants to read|quoted)/i.test(title)) return null;

  const id = (guid ?? link).match(/(\d+)\/?$/)?.[1] ?? guid ?? link;
  const date = new Date(pubDate).toISOString();
  const bookId = description.match(/bookwyrm\.social\/book\/(\d+)/)?.[1];

  const review = title.match(/^Review of "(.+)" \((\d(?:\.\d)?) stars?\)(?:: (.+))?$/);
  if (review) {
    const [, book, rating, rawReviewTitle] = review;
    const reviewTitle = rawReviewTitle && rawReviewTitle !== "None"
      ? rawReviewTitle
      : undefined;
    // rating-only statuses have a "rated X: N stars" description and a
    // literal "None" review title — both are redundant with the stars
    const isRatingOnly = /^rated\b.*\bstars?$/.test(stripHtml(description).trim());
    const body = !isRatingOnly ? sanitizeHtml(description) : "";
    // the review's own title leads the body, keeping the item title the book
    const content = (reviewTitle ? `<p><strong>${escapeHtml(reviewTitle)}</strong></p>` : "") + body;
    return {
      id,
      date,
      url: link,
      title: book,
      content_html: content || undefined,
      content_text: content ? stripHtml(content) : undefined,
      extra: {
        rating: parseFloat(rating),
        ...(bookId ? { book_id: bookId } : {}),
        book,
      },
    };
  }

  const finished = title.match(/finished reading (.+?) by (.+)$/i) ??
    title.match(/finished reading (.+)$/i);
  if (finished) {
    const book = finished[1].trim();
    const author = finished[2] ? cleanAuthor(finished[2]) : undefined;
    return {
      id,
      date,
      url: link,
      title: `${book}${author ? ` by ${author}` : ""}`,
      extra: {
        ...(bookId ? { book_id: bookId } : {}),
        book,
        ...(author ? { author } : {}),
      },
    };
  }

  return null;
}

export function collapseFinishedIntoRatings(items: Record<string, FeedItem>): void {
  const all = Object.values(items);
  for (const item of all) item.collapsed_into = undefined;

  for (const rating of all) {
    if (!rating.extra?.rating || rating.deleted) continue;
    const twin = all.find((other) =>
      other !== rating &&
      !other.deleted &&
      !other.extra?.rating &&
      other.extra?.book_id &&
      other.extra.book_id === rating.extra?.book_id &&
      Math.abs(new Date(other.date).getTime() - new Date(rating.date).getTime()) <
        COLLAPSE_WINDOW_MS
    );
    if (!twin) continue;
    twin.collapsed_into = rating.id;
    // one item carries everything: the finished fact, rating, and review
    const author = twin.extra?.author as string | undefined;
    rating.title = `${rating.extra?.book}${author ? ` by ${author}` : ""}`;
    if (author) rating.extra = { ...rating.extra, author };
  }
}

// The RSS feed carries almost no metadata, but the book's ActivityPub JSON
// does: cover, subtitle, blurb, series, publication data, identifiers, and
// author URLs (resolved to names with one cached fetch each). Everything is
// cached in state.meta so each book/author is only fetched once.
interface BookMeta {
  cover?: { url: string; alt?: string };
  subtitle?: string;
  description?: string; // sanitized HTML blurb
  series?: string;
  series_number?: string;
  published_date?: string;
  publishers?: string[];
  languages?: string[];
  isbn13?: string;
  openlibrary_url?: string;
  inventaire_url?: string;
  authors?: string[];
}

interface BookwyrmBook {
  title: string;
  subtitle?: string;
  description?: string;
  series?: string;
  seriesNumber?: string;
  publishedDate?: string;
  firstPublishedDate?: string;
  publishers?: string[];
  languages?: string[];
  isbn13?: string;
  openlibraryKey?: string;
  inventaireId?: string;
  authors?: string[];
  cover?: { url: string; name?: string };
}

async function fetchAuthorName(
  cache: Record<string, string | null>,
  url: string,
): Promise<string | null> {
  if (url in cache) return cache[url];
  try {
    const author = await fetchJson<{ name?: string }>(url, {
      Accept: "application/json",
    });
    cache[url] = author.name ?? null;
  } catch (error) {
    console.error(`bookwyrm author ${url}: ${error}`);
    return null; // not cached — retried next run
  }
  return cache[url];
}

async function fetchBookMeta(
  state: ReturnType<typeof loadState>,
  bookId: string,
): Promise<BookMeta | null> {
  state.meta ??= {};
  const books = (state.meta.books ??= {}) as Record<string, BookMeta | null>;
  const authors = (state.meta.authors ??= {}) as Record<string, string | null>;
  if (bookId in books) return books[bookId];
  try {
    const book = await fetchJson<BookwyrmBook>(
      `https://bookwyrm.social/book/${bookId}`,
      { Accept: "application/json" },
    );
    const names: string[] = [];
    for (const authorUrl of book.authors ?? []) {
      const name = await fetchAuthorName(authors, authorUrl);
      if (name) names.push(name);
    }
    books[bookId] = {
      cover: book.cover ? { url: book.cover.url, alt: book.cover.name } : undefined,
      subtitle: book.subtitle || undefined,
      description: book.description ? sanitizeHtml(book.description) : undefined,
      series: book.series || undefined,
      series_number: book.seriesNumber || undefined,
      published_date: book.publishedDate || book.firstPublishedDate || undefined,
      publishers: book.publishers?.length ? book.publishers : undefined,
      languages: book.languages?.length ? book.languages : undefined,
      isbn13: book.isbn13 || undefined,
      openlibrary_url: book.openlibraryKey
        ? `https://openlibrary.org/books/${book.openlibraryKey}`
        : undefined,
      inventaire_url: book.inventaireId
        ? `https://inventaire.io/entity/${book.inventaireId}`
        : undefined,
      authors: names.length ? names : undefined,
    };
  } catch (error) {
    console.error(`bookwyrm book ${bookId}: ${error}`);
    return null; // not cached — retried next run
  }
  return books[bookId];
}

export async function importBookwyrm(): Promise<void> {
  const state = loadState("bookwyrm");
  const xml = await fetchText(FEED_URL);
  const items = parseRssItems(xml, ["title", "link", "guid", "pubDate", "description"]);

  let count = 0;
  for (const rssItem of items) {
    const item = mapRssItem(rssItem);
    if (!item) continue;
    state.items[item.id] = { ...state.items[item.id], ...item };
    count++;
  }

  for (const item of Object.values(state.items)) {
    const bookId = item.extra?.book_id as string | undefined;
    if (!bookId) continue;
    const meta = await fetchBookMeta(state, bookId);
    if (!meta) continue;
    if (meta.cover && !item.media?.length) item.media = [meta.cover];
    const { cover: _cover, ...fields } = meta;
    item.extra = { ...item.extra, ...fields };
    // canonical author names beat the (often absent) RSS title suffix
    if (meta.authors?.length && item.extra.book && !item.title?.includes(" by ")) {
      item.title = `${item.extra.book} by ${meta.authors.join(" & ")}`;
      item.extra.author ??= meta.authors[0];
    }
  }

  collapseFinishedIntoRatings(state.items);
  saveState("bookwyrm", state);
  console.log(`bookwyrm: ${count} items in window`);
}

if (import.meta.main) await importBookwyrm();
