// Generates redirect stubs in ../blog/docs/ pointing old blog.kilian.io URLs
// at their new home under kilko.de/blog/. Run this only once kilko.de
// is live — it overwrites the rendered post pages in the old blog's repo
// (commit + push there separately). Other files (images, index.xml) are left
// untouched; feed readers keep the frozen index.xml since meta refresh
// doesn't apply to them.

const POSTS = new URL("../content/feed/blog/", import.meta.url);
const BLOG_DOCS = new URL("../../blog/docs/", import.meta.url);

function stub(target: string): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="refresh" content="0; url=${target}" />
    <link rel="canonical" href="${target}" />
    <title>Moved to kilko.de</title>
  </head>
  <body>
    <p>This post has moved to <a href="${target}">${target}</a>.</p>
  </body>
</html>
`;
}

if (import.meta.main) {
  let count = 0;
  for (const entry of Deno.readDirSync(POSTS)) {
    if (!entry.name.endsWith(".md") || entry.name === "_index.md") continue;
    const raw = Deno.readTextFileSync(new URL(entry.name, POSTS));
    const slug = raw.match(/^slug = "(.+)"$/m)?.[1];
    if (!slug) throw new Error(`no slug in ${entry.name}`);
    const target = `https://kilko.de/blog/${slug}/`;
    const dir = new URL(`${slug}/`, BLOG_DOCS);
    Deno.mkdirSync(dir, { recursive: true });
    Deno.writeTextFileSync(new URL("index.html", dir), stub(target));
    count++;
  }
  Deno.writeTextFileSync(
    new URL("index.html", BLOG_DOCS),
    stub("https://kilko.de/feed/"),
  );
  console.log(`wrote ${count} post redirects + root redirect`);
}
