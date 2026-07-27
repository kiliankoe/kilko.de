// One-off migration of the Hugo blog (../blog) into content/feed/posts/.
// Hugo used only date/title/slug in TOML frontmatter; slugs sometimes contain
// spaces that Hugo urlized for the final URL — we bake the urlized form in so
// URLs stay stable across the redirect from blog.kilian.io.

const BLOG_POSTS = new URL("../../blog/content/post/", import.meta.url);
const BLOG_IMAGES = new URL("../../blog/static/img/", import.meta.url);
const TARGET = new URL("../content/feed/posts/", import.meta.url);
const TARGET_IMAGES = new URL("../static/img/", import.meta.url);

export function urlize(slug: string): string {
  return slug
    .toLowerCase()
    .replaceAll(/\s+/g, "-")
    .replaceAll(/[^\p{L}\p{N}-]/gu, "");
}

export function parseFrontmatter(
  raw: string,
): { frontmatter: Record<string, string>; body: string } {
  const match = raw.match(/^\+\+\+\n([\s\S]*?)\n\+\+\+\n?([\s\S]*)$/);
  if (!match) throw new Error("no TOML frontmatter found");
  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^(\w+)\s*=\s*"(.*)"\s*$/);
    if (kv) frontmatter[kv[1]] = kv[2].replaceAll('\\"', '"');
  }
  return { frontmatter, body: match[2] };
}

export function convertPost(raw: string): string {
  // Control chars (e.g. a stray vertical tab in one 2015 post) are invalid
  // in XML 1.0 and would break the Atom feeds.
  const cleaned = raw.replaceAll(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, " ");
  const { frontmatter, body } = parseFrontmatter(cleaned);
  const { date, title, slug } = frontmatter;
  if (!date || !title || !slug) throw new Error("missing date/title/slug");
  const escapedTitle = title.replaceAll('"', '\\"');
  // Zola takes datetimes as bare TOML values, not strings.
  return `+++
title = "${escapedTitle}"
date = ${date}
slug = "${urlize(slug)}"
+++
${body}`;
}

if (import.meta.main) {
  let count = 0;
  for (const entry of Deno.readDirSync(BLOG_POSTS)) {
    if (!entry.name.endsWith(".md")) continue;
    const raw = Deno.readTextFileSync(new URL(entry.name, BLOG_POSTS));
    Deno.writeTextFileSync(new URL(entry.name, TARGET), convertPost(raw));
    count++;
  }
  let images = 0;
  Deno.mkdirSync(TARGET_IMAGES, { recursive: true });
  for (const entry of Deno.readDirSync(BLOG_IMAGES)) {
    if (!entry.isFile) continue;
    Deno.copyFileSync(
      new URL(entry.name, BLOG_IMAGES),
      new URL(entry.name, TARGET_IMAGES),
    );
    images++;
  }
  console.log(`migrated ${count} posts, copied ${images} images`);
}
