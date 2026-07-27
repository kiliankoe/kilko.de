// Regenerates content/feed/<section>/*.md wholesale from data/*.json.
// The markdown is a deterministic function of the state — never hand-edit it.

import { renderFrontmatter } from "./lib/frontmatter.ts";
import { type FeedItem, loadState } from "./lib/model.ts";

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

export function itemToMarkdown(
  source: string,
  item: FeedItem,
  alsoOn: { network: string; url: string; stats?: Record<string, number> }[],
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
    for (const item of Object.values(states[source].items)) {
      if (item.deleted || item.merged_into || item.collapsed_into) continue;
      const filename = `${item.date.slice(0, 10)}-${safeSlug(item.id)}.md`;
      const alsoOn = alsoOnByHost.get(`${source}/${item.id}`) ?? [];
      Deno.writeTextFileSync(
        new URL(filename, dir),
        itemToMarkdown(source, item, alsoOn),
      );
      count++;
    }
    console.log(`${source}: ${count} items → content/feed/${section}/`);
  }
}
