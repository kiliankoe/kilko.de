// Pulls received webmentions from webmention.io into data/webmentions.json,
// keyed by target path, for build-time display on original items.
// Requires WEBMENTION_IO_TOKEN (from https://webmention.io/settings).

import { fetchJson } from "./lib/http.ts";
import { sanitizeHtml } from "./lib/sanitize.ts";

const DOMAIN = "kilko.de";
const OUTPUT = new URL("../data/webmentions.json", import.meta.url);

interface Jf2Entry {
  "wm-property": string;
  "wm-target": string;
  url: string;
  published: string | null;
  author: { name: string; photo: string; url: string };
  content?: { html?: string; text?: string };
}

export interface Mention {
  url: string;
  published: string | null;
  author: { name: string; photo: string; url: string };
  content_html?: string;
}

export interface TargetMentions {
  likes: Mention[];
  reposts: Mention[];
  replies: Mention[];
}

export function groupByTarget(entries: Jf2Entry[]): Record<string, TargetMentions> {
  const result: Record<string, TargetMentions> = {};
  for (const entry of entries) {
    const path = new URL(entry["wm-target"]).pathname;
    const target = (result[path] ??= { likes: [], reposts: [], replies: [] });
    const mention: Mention = {
      url: entry.url,
      published: entry.published,
      author: entry.author,
      content_html: entry.content?.html
        ? sanitizeHtml(entry.content.html)
        : undefined,
    };
    switch (entry["wm-property"]) {
      case "like-of":
        target.likes.push(mention);
        break;
      case "repost-of":
        target.reposts.push(mention);
        break;
      case "in-reply-to":
      case "mention-of":
        target.replies.push(mention);
        break;
    }
  }
  return result;
}

if (import.meta.main) {
  const token = Deno.env.get("WEBMENTION_IO_TOKEN");
  if (!token) {
    console.error("WEBMENTION_IO_TOKEN not set");
    Deno.exit(1);
  }

  const entries: Jf2Entry[] = [];
  for (let page = 0; ; page++) {
    const response = await fetchJson<{ children: Jf2Entry[] }>(
      `https://webmention.io/api/mentions.jf2?domain=${DOMAIN}&token=${token}&per-page=1000&page=${page}`,
    );
    entries.push(...response.children);
    if (response.children.length < 1000) break;
  }

  Deno.writeTextFileSync(
    OUTPUT,
    JSON.stringify(groupByTarget(entries), null, 2) + "\n",
  );
  console.log(`webmentions: ${entries.length} mentions for ${DOMAIN}`);
}
