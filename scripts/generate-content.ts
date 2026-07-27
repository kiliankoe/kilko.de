// Regenerates content/feed/<section>/*.md wholesale from data/*.json.
// The markdown is a deterministic function of the state — never hand-edit it.

import { renderFrontmatter } from "./lib/frontmatter.ts";
import { type FeedItem, loadState } from "./lib/model.ts";
import { stripReQuotePrefix } from "./import/mastodon.ts";

export const SOURCE_SECTIONS: Record<string, string> = {
  mastodon: "mastodon",
  bluesky: "bluesky",
  github: "github",
  bookwyrm: "books",
  letterboxd: "movies",
};

export function safeSlug(id: string): string {
  return id.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "");
}

// Ordered thread continuations for a root item, with the "RE: <link>"
// paragraph stripped — inside the merged thread it's just noise.
export function threadSegments(item: FeedItem, all: FeedItem[]): {
  url: string;
  date: string;
  content_html?: string;
  media?: { url: string; alt?: string }[];
}[] {
  return all
    .filter((other) => other.thread_root === item.id && !other.deleted)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((segment) => ({
      url: segment.url,
      date: segment.date,
      content_html: segment.content_html && segment.extra?.re_target
        ? stripReQuotePrefix(segment.content_html)
        : segment.content_html,
      media: segment.media?.length ? segment.media : undefined,
    }));
}

export function itemToMarkdown(
  source: string,
  item: FeedItem,
  alsoOn: { network: string; url: string; stats?: Record<string, number> }[],
  thread: ReturnType<typeof threadSegments> = [],
): string {
  return renderFrontmatter({
    title: item.title ?? "",
    date: item.date,
    slug: safeSlug(item.id),
    extra: {
      origin_url: item.url,
      origin_id: item.id,
      content_html: item.content_html,
      media: item.media?.length ? item.media : undefined,
      stats: item.stats,
      stats_updated: item.stats_updated,
      interactions: item.interactions,
      also_on: alsoOn.length ? alsoOn : undefined,
      thread: thread.length ? thread : undefined,
      source,
      ...item.extra,
    },
  });
}

if (import.meta.main) {
  const states = Object.fromEntries(
    Object.keys(SOURCE_SECTIONS).map((source) => [source, loadState(source)]),
  );

  // Items merged into a host (cross-posts) surface as also_on on the host.
  const alsoOnByHost = new Map<
    string,
    { network: string; url: string; stats?: Record<string, number> }[]
  >();
  for (const [source, state] of Object.entries(states)) {
    for (const item of Object.values(state.items)) {
      if (!item.merged_into || item.deleted) continue;
      const entries = alsoOnByHost.get(item.merged_into) ?? [];
      entries.push({ network: source, url: item.url, stats: item.stats });
      alsoOnByHost.set(item.merged_into, entries);
    }
  }

  for (const [source, section] of Object.entries(SOURCE_SECTIONS)) {
    const dir = new URL(`../content/feed/${section}/`, import.meta.url);
    for (const entry of Deno.readDirSync(dir)) {
      if (entry.name.endsWith(".md") && entry.name !== "_index.md") {
        Deno.removeSync(new URL(entry.name, dir));
      }
    }
    let count = 0;
    const allItems = Object.values(states[source].items);
    for (const item of allItems) {
      if (item.deleted || item.merged_into || item.collapsed_into) continue;
      if (item.thread_root) continue; // rendered as a segment of its root
      const filename = `${item.date.slice(0, 10)}-${safeSlug(item.id)}.md`;
      const alsoOn = alsoOnByHost.get(`${source}/${item.id}`) ?? [];
      Deno.writeTextFileSync(
        new URL(filename, dir),
        itemToMarkdown(source, item, alsoOn, threadSegments(item, allItems)),
      );
      count++;
    }
    console.log(`${source}: ${count} items → content/feed/${section}/`);
  }
}
