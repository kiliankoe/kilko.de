import { assertEquals } from "jsr:@std/assert";
import { renderFrontmatter, tomlString, tomlValue } from "./frontmatter.ts";
import { isCrossPost, normalizeText, similarity } from "./dedup.ts";
import { sanitizeHtml, stripHtml } from "./sanitize.ts";

Deno.test("tomlString escapes quotes, backslashes, newlines, control chars", () => {
  assertEquals(tomlString('he said "hi"'), '"he said \\"hi\\""');
  assertEquals(tomlString("a\\b"), '"a\\\\b"');
  assertEquals(tomlString("line1\nline2"), '"line1\\nline2"');
  assertEquals(tomlString("bad\x0bchar"), '"bad char"');
});

Deno.test("tomlValue renders inline tables and arrays of tables", () => {
  assertEquals(
    tomlValue([{ url: "https://x/y.jpg", alt: "pic" }]),
    '[{ url = "https://x/y.jpg", alt = "pic" }]',
  );
  assertEquals(tomlValue({ favs: 3, boosts: 1 }), "{ favs = 3, boosts = 1 }");
});

Deno.test("renderFrontmatter emits valid Zola frontmatter", () => {
  const fm = renderFrontmatter({
    title: "",
    date: "2026-07-25T10:11:12Z",
    slug: "114882259",
    extra: {
      origin_url: "https://chaos.social/@kilian/114882259",
      content_html: "<p>hello</p>",
      stats: { favs: 3 },
      skipped: undefined,
    },
  });
  assertEquals(
    fm,
    `+++
title = ""
date = 2026-07-25T10:11:12Z
slug = "114882259"
[extra]
origin_url = "https://chaos.social/@kilian/114882259"
content_html = "<p>hello</p>"
stats = { favs = 3 }
+++
`,
  );
});

Deno.test("normalizeText drops URLs, mentions, and hashtag markers", () => {
  assertEquals(
    normalizeText("Check this out https://example.com/x @friend@chaos.social #cool"),
    "check this out cool",
  );
});

Deno.test("similarity is high for truncated crossposts", () => {
  const a = "I wrote a thing about static sites and federation, have a look";
  const b = "I wrote a thing about static sites and federation, have a…";
  assertEquals(similarity(a, b) >= 0.9, true);
  assertEquals(similarity(a, "completely different text about cooking pasta") < 0.5, true);
});

Deno.test("isCrossPost requires both text match and time window", () => {
  const masto = {
    date: "2026-07-25T10:00:00Z",
    content_text: "New blog post about zola! https://kilko.de/feed/posts/x/",
  };
  const bsky = {
    date: "2026-07-25T10:10:00Z",
    content_text: "New blog post about zola! https://kilko.de/feed/posts/x/",
  };
  const late = { ...bsky, date: "2026-07-25T12:00:00Z" };
  assertEquals(isCrossPost(masto, bsky), true);
  assertEquals(isCrossPost(masto, late), false);
});

Deno.test("sanitizeHtml strips scripts, event handlers, and js: links", () => {
  const dirty =
    `<p onclick="evil()">hi <a href="javascript:evil()">x</a> <a href="https://ok.example">ok</a></p><script>evil()</script><img src="https://x/y.png" onerror="evil()">`;
  const clean = sanitizeHtml(dirty);
  assertEquals(clean.includes("script"), false);
  assertEquals(clean.includes("onclick"), false);
  assertEquals(clean.includes("onerror"), false);
  assertEquals(clean.includes("javascript:"), false);
  assertEquals(clean.includes('href="https://ok.example"'), true);
});

Deno.test("stripHtml returns text content", () => {
  assertEquals(stripHtml("<p>hello <b>world</b></p>"), "hello world");
});

Deno.test("media paths derive extensions from CDN URL shapes", async () => {
  const { extensionFor, localMediaPath } = await import("./media.ts");
  assertEquals(extensionFor("https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:x/bafy@jpeg"), ".jpg");
  assertEquals(extensionFor("https://assets.chaos.social/media_attachments/files/1/original/abc.jpeg"), ".jpg");
  assertEquals(extensionFor("https://assets.chaos.social/files/abc.png"), ".png");
  assertEquals(extensionFor("https://example.com/no-extension"), ".jpg");
  assertEquals(
    localMediaPath("mastodon", "114882259", 0, "https://assets.chaos.social/files/abc.png"),
    "/media/mastodon/114882259-0.png",
  );
});

Deno.test("bluesky thread flattening produces jf2-shaped replies", async () => {
  const { flattenThread } = await import("../fetch-interactions.ts");
  const thread = {
    post: undefined,
    replies: [
      {
        post: {
          uri: "at://did:plc:a/app.bsky.feed.post/r1",
          author: { handle: "friend.example", displayName: "Friend", avatar: "https://x/a.jpg" },
          record: { text: "nice!", createdAt: "2026-07-25T11:00:00Z" },
        },
        replies: [
          {
            post: {
              uri: "at://did:plc:b/app.bsky.feed.post/r2",
              author: { handle: "other.example" },
              record: { text: "agreed", createdAt: "2026-07-25T12:00:00Z" },
            },
          },
        ],
      },
    ],
  };
  const replies = flattenThread(thread);
  assertEquals(replies.length, 2);
  assertEquals(replies[0].author.name, "Friend");
  assertEquals(replies[0].url, "https://bsky.app/profile/friend.example/post/r1");
  assertEquals(replies[0].content_html, "<p>nice!</p>");
  assertEquals(replies[1].author.name, "other.example");
});

Deno.test("parseSocialUrl handles mastodon and bluesky post URLs", async () => {
  const { parseSocialUrl } = await import("../fetch-interactions.ts");
  assertEquals(parseSocialUrl("https://chaos.social/@kilian/114882259"), {
    network: "mastodon",
    api: "https://chaos.social/api/v1",
    id: "114882259",
    url: "https://chaos.social/@kilian/114882259",
  });
  assertEquals(
    parseSocialUrl("https://mastodon.social/users/someone/statuses/12345"),
    {
      network: "mastodon",
      api: "https://mastodon.social/api/v1",
      id: "12345",
      url: "https://mastodon.social/users/someone/statuses/12345",
    },
  );
  assertEquals(parseSocialUrl("https://bsky.app/profile/kilian.io/post/3kxyz"), {
    network: "bluesky",
    atUri: "at://kilian.io/app.bsky.feed.post/3kxyz",
    url: "https://bsky.app/profile/kilian.io/post/3kxyz",
  });
  assertEquals(parseSocialUrl("https://example.com/whatever"), null);
});

Deno.test("extractSocialLinks reads string or array social frontmatter", async () => {
  const { extractSocialLinks } = await import("../fetch-interactions.ts");
  const array = `+++
title = "x"
[extra]
social = ["https://chaos.social/@kilian/1", "https://bsky.app/profile/kilian.io/post/a"]
+++
body`;
  assertEquals(extractSocialLinks(array), [
    "https://chaos.social/@kilian/1",
    "https://bsky.app/profile/kilian.io/post/a",
  ]);
  const single = `+++
title = "x"
[extra]
social = "https://chaos.social/@kilian/2"
+++
body social = "https://not.in/frontmatter"`;
  assertEquals(extractSocialLinks(single), ["https://chaos.social/@kilian/2"]);
  assertEquals(extractSocialLinks(`+++\ntitle = "x"\n+++\nbody`), []);
});

Deno.test("pagePathFor derives the page path from slug or filename", async () => {
  const { pagePathFor } = await import("../fetch-interactions.ts");
  assertEquals(
    pagePathFor("posts", "2016-06-14-wwdc16.md", '+++\nslug = "wwdc-16"\n+++'),
    "/feed/posts/wwdc-16/",
  );
  assertEquals(
    pagePathFor("posts", "2026-08-01-new-post.md", "+++\ntitle = \"x\"\n+++"),
    "/feed/posts/new-post/",
  );
});

Deno.test("groupByTarget buckets webmentions by target path and kind", async () => {
  const { groupByTarget } = await import("../fetch-webmentions.ts");
  const author = { name: "A", photo: "https://x/p.jpg", url: "https://x" };
  const grouped = groupByTarget([
    { "wm-property": "like-of", "wm-target": "https://kilko.de/feed/posts/x/", url: "https://a/1", published: null, author },
    { "wm-property": "in-reply-to", "wm-target": "https://kilko.de/feed/posts/x/", url: "https://a/2", published: "2026-07-26T00:00:00Z", author, content: { html: "<p>nice<script>evil()</script></p>" } },
    { "wm-property": "repost-of", "wm-target": "https://kilko.de/feed/posts/y/", url: "https://a/3", published: null, author },
  ]);
  assertEquals(grouped["/feed/posts/x/"].likes.length, 1);
  assertEquals(grouped["/feed/posts/x/"].replies.length, 1);
  assertEquals(grouped["/feed/posts/x/"].replies[0].content_html?.includes("script"), false);
  assertEquals(grouped["/feed/posts/y/"].reposts.length, 1);
});
