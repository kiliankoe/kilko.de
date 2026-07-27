import { assertEquals } from "jsr:@std/assert";
import * as mastodon from "./mastodon.ts";
import * as bluesky from "./bluesky.ts";
import * as github from "./github.ts";
import * as bookwyrm from "./bookwyrm.ts";
import * as letterboxd from "./letterboxd.ts";
import { parseRssItems } from "../lib/rss.ts";
import { itemToMarkdown, safeSlug } from "../generate-content.ts";

const mastodonStatus = {
  id: "114882259",
  created_at: "2026-07-25T10:11:12.000Z",
  url: "https://chaos.social/@kilian/114882259",
  visibility: "public",
  content: '<p>Hello <a href="https://example.com">world</a></p>',
  in_reply_to_id: null,
  in_reply_to_account_id: null,
  account: { id: "15760" },
  reblog: null,
  favourites_count: 3,
  reblogs_count: 1,
  replies_count: 2,
  media_attachments: [
    { type: "image", url: "https://cdn.example/pic.jpg", description: "a pic" },
  ],
};

Deno.test("mastodon mapStatus produces a sanitized feed item", () => {
  const item = mastodon.mapStatus(mastodonStatus);
  assertEquals(item.id, "114882259");
  assertEquals(item.content_text?.trim(), "Hello world");
  assertEquals(item.media, [{ url: "https://cdn.example/pic.jpg", alt: "a pic" }]);
  assertEquals(item.stats, { favs: 3, boosts: 1, replies: 2 });
});

Deno.test("mastodon filters replies, boosts, non-public, and loop posts", () => {
  assertEquals(mastodon.isFeedWorthy(mastodonStatus), true);
  assertEquals(mastodon.isFeedWorthy({ ...mastodonStatus, visibility: "unlisted" }), false);
  // replies to others stay out; self-replies (thread continuations) stay in
  assertEquals(
    mastodon.isFeedWorthy({
      ...mastodonStatus,
      in_reply_to_id: "1",
      in_reply_to_account_id: "someone-else",
    }),
    false,
  );
  assertEquals(
    mastodon.isFeedWorthy({
      ...mastodonStatus,
      in_reply_to_id: "1",
      in_reply_to_account_id: "15760",
    }),
    true,
  );
  assertEquals(mastodon.isFeedWorthy({ ...mastodonStatus, reblog: {} }), false);
  assertEquals(
    mastodon.isFeedWorthy({
      ...mastodonStatus,
      content: '<p>new post <a href="https://kilko.de/feed/posts/x/">x</a></p>',
    }),
    false,
  );
});

const RE_HTML =
  '<p>RE: <a href="https://chaos.social/@kilian/100" rel="nofollow noopener"><span class="invisible">https://</span><span class="ellipsis">chaos.social/@kilian/1</span><span class="invisible">00</span></a></p><p>More thoughts.</p>';

Deno.test("mastodon RE-quote detection and prefix stripping", () => {
  assertEquals(mastodon.reQuoteTarget(RE_HTML), "100");
  assertEquals(mastodon.reQuoteTarget("<p>Regular post</p>"), undefined);
  assertEquals(mastodon.stripReQuotePrefix(RE_HTML), "<p>More thoughts.</p>");
});

Deno.test("assembleThreads resolves chains, RE-quotes, and guards cycles", () => {
  const item = (
    id: string,
    date: string,
    extra?: Record<string, unknown>,
  ): import("../lib/model.ts").FeedItem => ({
    id,
    date,
    url: `https://chaos.social/@kilian/${id}`,
    extra,
  });
  const items: Record<string, import("../lib/model.ts").FeedItem> = {
    "100": item("100", "2026-07-01"),
    "101": item("101", "2026-07-01", { in_reply_to: "100" }),
    "102": item("102", "2026-07-02", { in_reply_to: "101" }),
    "103": item("103", "2026-07-03", { re_target: "100" }),
    "200": item("200", "2026-07-04"),
    // reply chain pointing at an unknown parent stays standalone
    "300": item("300", "2026-07-05", { in_reply_to: "999" }),
    // artificial cycle must not hang
    "400": item("400", "2026-07-06", { in_reply_to: "401" }),
    "401": item("401", "2026-07-06", { in_reply_to: "400" }),
  };
  mastodon.assembleThreads(items);
  assertEquals(items["101"].thread_root, "100");
  assertEquals(items["102"].thread_root, "100");
  assertEquals(items["103"].thread_root, "100");
  assertEquals(items["100"].thread_root, undefined);
  assertEquals(items["200"].thread_root, undefined);
  assertEquals(items["300"].thread_root, undefined);
});

const bskyPost = {
  uri: "at://did:plc:abc123/app.bsky.feed.post/3kxyz",
  author: { handle: "kilian.io" },
  record: { text: "Hello from bsky\nsecond line https://example.com", createdAt: "2026-07-25T10:12:00.000Z" },
  likeCount: 2,
  repostCount: 1,
  replyCount: 0,
  quoteCount: 1,
};

Deno.test("bluesky mapPost converts at-uri, linkifies, and merges quote count", () => {
  const item = bluesky.mapPost(bskyPost);
  assertEquals(item.id, "3kxyz");
  assertEquals(item.url, "https://bsky.app/profile/kilian.io/post/3kxyz");
  assertEquals(item.stats, { likes: 2, reposts: 2, replies: 0 });
  assertEquals(
    item.content_html,
    '<p>Hello from bsky<br>second line <a href="https://example.com" rel="nofollow noopener">https://example.com</a></p>',
  );
});

Deno.test("bluesky filters reposts and foreign replies, keeps self-threads", () => {
  assertEquals(bluesky.isFeedWorthy({ post: bskyPost }), true);
  assertEquals(bluesky.isFeedWorthy({ post: bskyPost, reason: {} }), false);
  const foreignReply = {
    ...bskyPost,
    record: {
      ...bskyPost.record,
      reply: {
        root: { uri: "at://did:plc:other/app.bsky.feed.post/r" },
        parent: { uri: "at://did:plc:other/app.bsky.feed.post/r" },
      },
    },
  };
  assertEquals(bluesky.isFeedWorthy({ post: foreignReply }), false);
  const selfReply = {
    ...bskyPost,
    record: {
      ...bskyPost.record,
      reply: {
        root: { uri: "at://did:plc:abc123/app.bsky.feed.post/3root" },
        parent: { uri: "at://did:plc:abc123/app.bsky.feed.post/3root" },
      },
    },
  };
  assertEquals(bluesky.isFeedWorthy({ post: selfReply }), true);
  const mapped = bluesky.mapPost(selfReply);
  assertEquals(mapped.extra?.in_reply_to, "3root");
  assertEquals(mapped.extra?.reply_root, "3root");
});

Deno.test("bluesky recordToHtml renders full URLs from facets (byte offsets)", () => {
  // "schöne Seite: example.com/foo…" — text shows a truncated link; the facet
  // (with UTF-8 byte offsets shifted by the umlaut) holds the full URL
  const text = "schöne Seite: example.com/foo… #zola";
  const bytes = new TextEncoder().encode(text);
  const linkStart = 15; // "example.com/foo…" starts after the ö shifts bytes
  const linkEnd = linkStart + new TextEncoder().encode("example.com/foo…").length;
  const tagStart = bytes.length - new TextEncoder().encode("#zola").length;
  const html = bluesky.recordToHtml({
    text,
    createdAt: "2026-07-25T10:00:00Z",
    facets: [
      {
        index: { byteStart: tagStart, byteEnd: bytes.length },
        features: [{ $type: "app.bsky.richtext.facet#tag", tag: "zola" }],
      },
      {
        index: { byteStart: linkStart, byteEnd: linkEnd },
        features: [{ $type: "app.bsky.richtext.facet#link", uri: "https://example.com/foo/very/long/path" }],
      },
    ],
  });
  assertEquals(
    html,
    '<p>schöne Seite: <a href="https://example.com/foo/very/long/path" rel="nofollow noopener">https://example.com/foo/very/long/path</a> <a href="https://bsky.app/hashtag/zola" rel="nofollow noopener">#zola</a></p>',
  );
});

Deno.test("bluesky externalCard captures link previews, skips kilko.de", () => {
  const withCard = {
    ...bskyPost,
    embed: {
      $type: "app.bsky.embed.external#view",
      external: { uri: "https://example.com/article", title: "An Article", description: "Words", thumb: "https://cdn/thumb.jpg" },
    },
  };
  assertEquals(bluesky.externalCard(withCard), {
    url: "https://example.com/article",
    title: "An Article",
    description: "Words",
    image: "https://cdn/thumb.jpg",
  });
  const ownCard = {
    ...bskyPost,
    embed: {
      $type: "app.bsky.embed.external#view",
      external: { uri: "https://kilko.de/feed/posts/x/", title: "x" },
    },
  };
  assertEquals(bluesky.externalCard(ownCard), undefined);
  assertEquals(bluesky.externalCard(bskyPost), undefined);
});

Deno.test("mastodon captures link preview cards", () => {
  const withCard = {
    ...mastodonStatus,
    card: {
      url: "https://example.com/article",
      title: "An Article",
      description: "Words",
      image: "https://cdn/preview.png",
      type: "link",
    },
  };
  assertEquals(mastodon.mapStatus(withCard).extra?.card, {
    url: "https://example.com/article",
    title: "An Article",
    description: "Words",
    image: "https://cdn/preview.png",
  });
  assertEquals(mastodon.mapStatus(mastodonStatus).extra, undefined);
});

Deno.test("bluesky loop guard catches kilko.de in facets and link cards", () => {
  const facetPost = {
    ...bskyPost,
    record: {
      ...bskyPost.record,
      text: "new post!",
      facets: [{
        features: [{ $type: "app.bsky.richtext.facet#link", uri: "https://kilko.de/feed/posts/x/" }],
      }],
    },
  };
  assertEquals(bluesky.isFeedWorthy({ post: facetPost }), false);

  const cardPost = {
    ...bskyPost,
    record: {
      ...bskyPost.record,
      text: "new post!",
      embed: { $type: "app.bsky.embed.external", external: { uri: "https://kilko.de/feed/posts/x/" } },
    },
  };
  assertEquals(bluesky.isFeedWorthy({ post: cardPost }), false);

  const otherCard = {
    ...bskyPost,
    record: {
      ...bskyPost.record,
      text: "interesting link",
      embed: { $type: "app.bsky.embed.external", external: { uri: "https://example.com/" } },
    },
  };
  assertEquals(bluesky.isFeedWorthy({ post: otherCard }), true);
});

Deno.test("github mapEvent keeps releases and foreign merged PRs only", () => {
  const release = github.mapEvent({
    id: "1",
    type: "ReleaseEvent",
    created_at: "2026-07-01T00:00:00Z",
    repo: { name: "kiliankoe/dvb" },
    payload: {
      action: "published",
      release: { html_url: "https://github.com/kiliankoe/dvb/releases/v1", tag_name: "v1.0.0", name: null },
    },
  });
  assertEquals(release?.title, "Released kiliankoe/dvb v1.0.0");

  const push = github.mapEvent({
    id: "2",
    type: "PushEvent",
    created_at: "2026-07-01T00:00:00Z",
    repo: { name: "kiliankoe/dvb" },
    payload: {},
  });
  assertEquals(push, null);

  const ownPr = github.mapEvent({
    id: "3",
    type: "PullRequestEvent",
    created_at: "2026-07-01T00:00:00Z",
    repo: { name: "kiliankoe/dvb" },
    payload: {
      action: "closed",
      pull_request: { html_url: "https://x", title: "Fix", merged: true },
    },
  });
  assertEquals(ownPr, null);

  const foreignPr = github.mapEvent({
    id: "4",
    type: "PullRequestEvent",
    created_at: "2026-07-01T00:00:00Z",
    repo: { name: "someoneelse/project" },
    payload: {
      action: "closed",
      pull_request: { html_url: "https://x", title: "Fix a bug", merged: true },
    },
  });
  assertEquals(foreignPr?.title, "Merged PR in someoneelse/project: Fix a bug");
});

function bookwyrmRssItem(id: string, title: string, pubDate: string, description: string): string {
  return `<item>
  <title><![CDATA[${title}]]></title>
  <link>https://bookwyrm.social/user/kilian/review/${id}</link>
  <guid>https://bookwyrm.social/user/kilian/review/${id}</guid>
  <pubDate>${pubDate}</pubDate>
  <description><![CDATA[${description}]]></description>
</item>`;
}

const bookwyrmRss = `<rss><channel>
${bookwyrmRssItem(
  "101",
  'Review of "I Who Have Never Known Men" (4 stars): None',
  "Mon, 06 Jul 2026 20:00:00 GMT",
  'rated <em><a href="https://bookwyrm.social/book/416044">I Who Have Never Known Men</a></em>: 4 stars',
)}
${bookwyrmRssItem(
  "102",
  "Kilian finished reading I Who Have Never Known Men by Jacqueline Harpman",
  "Mon, 06 Jul 2026 19:00:00 GMT",
  'Kilian finished reading <a href="https://bookwyrm.social/book/416044"><i>I Who Have Never Known Men</i></a>',
)}
${bookwyrmRssItem(
  "103",
  "Kilian started reading I Who Have Never Known Men by Jacqueline Harpman",
  "Wed, 24 Jun 2026 10:00:00 GMT",
  'Kilian started reading <a href="https://bookwyrm.social/book/416044"><i>I Who Have Never Known Men</i></a>',
)}
${bookwyrmRssItem(
  "104",
  "Kilian finished reading Compulsory by Martha Wells\n\n\n\n\n\n(The Murderbot Diaries, #0.5)",
  "Mon, 18 May 2026 10:00:00 GMT",
  'Kilian finished reading <a href="https://bookwyrm.social/book/1437644"><i>Compulsory</i></a>',
)}
${bookwyrmRssItem(
  "105",
  'Review of "Actual Review Book" (3 stars): Mixed feelings',
  "Sun, 17 May 2026 10:00:00 GMT",
  "<p>Long form thoughts about the book.</p>",
)}
</channel></rss>`;

const BOOKWYRM_TAGS = ["title", "link", "guid", "pubDate", "description"];

Deno.test("bookwyrm maps ratings with clean titles and drops redundant content", () => {
  const items = parseRssItems(bookwyrmRss, BOOKWYRM_TAGS);
  const rating = bookwyrm.mapRssItem(items[0]);
  assertEquals(rating?.id, "101");
  assertEquals(rating?.title, "I Who Have Never Known Men");
  assertEquals(rating?.extra?.rating, 4);
  assertEquals(rating?.extra?.book_id, "416044");
  assertEquals(rating?.content_html, undefined);
});

Deno.test("bookwyrm maps finished-reading with normalized title, skips started", () => {
  const items = parseRssItems(bookwyrmRss, BOOKWYRM_TAGS);
  const finished = bookwyrm.mapRssItem(items[1]);
  assertEquals(finished?.title, "Finished reading I Who Have Never Known Men by Jacqueline Harpman");
  assertEquals(finished?.extra?.book_id, "416044");
  assertEquals(finished?.content_html, undefined);
  assertEquals(bookwyrm.mapRssItem(items[2]), null);
  const series = bookwyrm.mapRssItem(items[3]);
  assertEquals(series?.title, "Finished reading Compulsory by Martha Wells");
});

Deno.test("bookwyrm keeps real review text", () => {
  const items = parseRssItems(bookwyrmRss, BOOKWYRM_TAGS);
  const review = bookwyrm.mapRssItem(items[4]);
  assertEquals(review?.title, "Actual Review Book");
  assertEquals(review?.extra?.rating, 3);
  assertEquals(review?.content_html?.includes("<strong>Mixed feelings</strong>"), true);
  assertEquals(review?.content_html?.includes("Long form thoughts"), true);
});

Deno.test("bookwyrm collapses rating + finished-reading of the same book", () => {
  const items = parseRssItems(bookwyrmRss, BOOKWYRM_TAGS)
    .map((item) => bookwyrm.mapRssItem(item))
    .filter((item) => item !== null);
  const byId = Object.fromEntries(items.map((item) => [item.id, item]));
  bookwyrm.collapseFinishedIntoRatings(byId);
  // the finished item is absorbed by the rating, which carries everything
  assertEquals(byId["102"].collapsed_into, "101");
  assertEquals(byId["101"].title, "Finished reading I Who Have Never Known Men by Jacqueline Harpman");
  // a lone finished item stays untouched
  assertEquals(byId["104"].collapsed_into, undefined);
});

const letterboxdRss = `<rss><channel>
<item>
  <title>Dune: Part Three, 2026 - ★★★★½</title>
  <link>https://letterboxd.com/kiliankoe/film/dune-part-three/</link>
  <guid isPermaLink="false">letterboxd-watch-123456789</guid>
  <pubDate>Sat, 25 Jul 2026 04:00:00 +1200</pubDate>
  <letterboxd:watchedDate>2026-07-24</letterboxd:watchedDate>
  <letterboxd:rewatch>Yes</letterboxd:rewatch>
  <letterboxd:filmTitle>Dune: Part Three</letterboxd:filmTitle>
  <letterboxd:filmYear>2026</letterboxd:filmYear>
  <letterboxd:memberRating>4.5</letterboxd:memberRating>
  <letterboxd:memberLike>Yes</letterboxd:memberLike>
  <tmdb:movieId>1234567</tmdb:movieId>
  <description><![CDATA[<p><img src="https://a.ltrbxd.com/poster.jpg"/></p><p>Stunning.</p>]]></description>
</item>
</channel></rss>`;

Deno.test("letterboxd maps diary entries with poster and rating", () => {
  const items = parseRssItems(letterboxdRss, [
    "title", "link", "guid", "pubDate", "description",
    "letterboxd:filmTitle", "letterboxd:filmYear",
    "letterboxd:memberRating", "letterboxd:watchedDate",
    "letterboxd:rewatch", "letterboxd:memberLike", "tmdb:movieId",
  ]);
  const item = letterboxd.mapRssItem(items[0]);
  assertEquals(item?.title, "Dune: Part Three (2026)");
  assertEquals(item?.extra?.rating, 4.5);
  assertEquals(item?.extra?.rewatch, true);
  assertEquals(item?.extra?.liked, true);
  assertEquals(item?.extra?.tmdb_url, "https://www.themoviedb.org/movie/1234567");
  assertEquals(item?.media, [{ url: "https://a.ltrbxd.com/poster.jpg", alt: "Dune: Part Three" }]);
  assertEquals(item?.content_html?.includes("Stunning"), true);
  assertEquals(item?.content_html?.includes("<img"), false);
  assertEquals(item?.date, "2026-07-24T00:00:00.000Z");
});

Deno.test("generate-content renders markdown with also_on for merged items", () => {
  const md = itemToMarkdown(
    "mastodon",
    {
      id: "114882259",
      date: "2026-07-25T10:11:12.000Z",
      url: "https://chaos.social/@kilian/114882259",
      content_html: "<p>hi</p>",
      stats: { favs: 3 },
    },
    [{ network: "bluesky", url: "https://bsky.app/profile/kilian.io/post/3kxyz", stats: { likes: 2 } }],
  );
  assertEquals(md.includes('origin_url = "https://chaos.social/@kilian/114882259"'), true);
  assertEquals(md.includes("also_on = [{ network = \"bluesky\""), true);
  assertEquals(md.includes('source = "mastodon"'), true);
  assertEquals(safeSlug("letterboxd-watch-123456789"), "letterboxd-watch-123456789");
  assertEquals(safeSlug("at://weird/UPPER"), "at-weird-upper");
});
