// One-off backfill of the full BookWyrm history via the ActivityPub outbox
// (the RSS feed only carries recent items). Walks all outbox pages, maps the
// objects through the same logic as the RSS importer, adds anything missing
// to the state, then runs the normal import for book metadata + collapse.

import { fetchJson } from "./lib/http.ts";
import { stripHtml } from "./lib/sanitize.ts";
import { type RssItem } from "./lib/rss.ts";
import { loadState, saveState } from "./lib/model.ts";
import { importBookwyrm, mapRssItem } from "./import/bookwyrm.ts";

const OUTBOX = "https://bookwyrm.social/user/kilian/outbox";

interface OutboxObject {
  type: string;
  id: string;
  name?: string | null;
  content?: string;
  published?: string;
}

// The outbox objects carry the same generated content as the RSS items; the
// RSS <title> equivalent is the object name (reviews) or the content text.
export function outboxObjectToRssItem(object: OutboxObject): RssItem | null {
  if (!object.id || !object.content || !object.published) return null;
  return {
    title: object.name || stripHtml(object.content).trim(),
    link: object.id,
    guid: object.id,
    pubDate: object.published,
    description: object.content,
  };
}

if (import.meta.main) {
  const state = loadState("bookwyrm");
  let added = 0;
  let seen = 0;

  let pageUrl: string | undefined =
    (await fetchJson<{ first: string }>(OUTBOX, { Accept: "application/json" })).first;

  while (pageUrl) {
    const page: {
      orderedItems?: (OutboxObject | { object?: OutboxObject | string })[];
      next?: string;
    } = await fetchJson(pageUrl, { Accept: "application/json" });

    for (const entry of page.orderedItems ?? []) {
      // BookWyrm lists bare Notes; boosts wrap/reference other objects
      const object = "content" in entry
        ? entry as OutboxObject
        : (entry as { object?: OutboxObject | string }).object;
      if (!object || typeof object !== "object") continue;
      seen++;
      const rssItem = outboxObjectToRssItem(object);
      if (!rssItem) continue;
      const item = mapRssItem(rssItem);
      if (!item || state.items[item.id]) continue;
      state.items[item.id] = item;
      added++;
    }
    pageUrl = page.next;
  }

  saveState("bookwyrm", state);
  console.log(`backfill: ${added} new items from ${seen} outbox objects`);

  // normal import fetches book metadata/covers and collapses pairs
  await importBookwyrm();
}
