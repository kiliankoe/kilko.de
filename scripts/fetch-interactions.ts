// Refreshes interaction data for recent Mastodon and Bluesky items: counts,
// plus who fav'd/boosted (avatar strips) and the reply threads, rendered
// statically on item pages. Items older than the window keep their last
// snapshot. Everything is shaped like webmention.io's jf2 entries so the
// templates share markup with webmentions.

import { fetchJson } from "./lib/http.ts";
import { sanitizeHtml } from "./lib/sanitize.ts";
import {
  type Interaction,
  type Interactions,
  loadState,
  saveState,
  statsPatch,
} from "./lib/model.ts";
import { atUriToWebUrl, textToHtml } from "./import/bluesky.ts";
import { fetchRepoMeta } from "./import/github.ts";

const WINDOW_DAYS = 30;
const MASTODON_API = "https://chaos.social/api/v1";
const BSKY_API = "https://public.api.bsky.app/xrpc";

function isRecent(date: string): boolean {
  return Date.now() - new Date(date).getTime() < WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

const OWN_BSKY_HANDLE = "kilian.io";

interface MastodonAccount {
  id?: string;
  display_name: string;
  acct: string;
  url: string;
  avatar_static?: string;
  avatar?: string;
}

export function mapMastodonAccount(account: MastodonAccount): Interaction {
  return {
    author: {
      name: account.display_name || account.acct,
      photo: account.avatar_static || account.avatar,
      url: account.url,
    },
  };
}

interface BskyActor {
  displayName?: string;
  handle: string;
  avatar?: string;
}

export function mapBskyActor(actor: BskyActor): Interaction {
  return {
    author: {
      name: actor.displayName || actor.handle,
      photo: actor.avatar,
      url: `https://bsky.app/profile/${actor.handle}`,
    },
  };
}

interface BskyThreadNode {
  post?: {
    uri: string;
    author: BskyActor;
    record: { text: string; createdAt: string };
  };
  replies?: BskyThreadNode[];
}

export function flattenThread(
  node: BskyThreadNode,
  excludeHandle?: string,
): Interaction[] {
  const replies: Interaction[] = [];
  for (const child of node.replies ?? []) {
    // own posts in the tree are thread continuations, not replies
    if (child.post && child.post.author.handle !== excludeHandle) {
      replies.push({
        ...mapBskyActor(child.post.author),
        url: atUriToWebUrl(child.post.uri, child.post.author.handle),
        published: child.post.record.createdAt,
        content_html: textToHtml(child.post.record.text),
      });
    }
    replies.push(...flattenThread(child, excludeHandle));
  }
  return replies;
}

async function fetchMastodonInteractions(
  id: string,
  api = MASTODON_API,
  excludeAccountId?: string,
): Promise<Interactions> {
  const [favs, boosts, context] = await Promise.all([
    fetchJson<MastodonAccount[]>(`${api}/statuses/${id}/favourited_by?limit=80`),
    fetchJson<MastodonAccount[]>(`${api}/statuses/${id}/reblogged_by?limit=80`),
    fetchJson<{
      descendants: {
        url: string;
        created_at: string;
        content: string;
        account: MastodonAccount;
      }[];
    }>(`${api}/statuses/${id}/context`),
  ]);
  return {
    likes: favs.map(mapMastodonAccount),
    reposts: boosts.map(mapMastodonAccount),
    replies: context.descendants
      // own posts among the descendants are thread continuations, not replies
      .filter((reply) => !excludeAccountId || reply.account.id !== excludeAccountId)
      .map((reply) => ({
        ...mapMastodonAccount(reply.account),
        url: reply.url,
        published: reply.created_at,
        content_html: sanitizeHtml(reply.content),
      })),
  };
}

async function fetchBskyInteractions(atUri: string): Promise<Interactions> {
  const uri = encodeURIComponent(atUri);
  const [likes, reposts, thread] = await Promise.all([
    fetchJson<{ likes: { actor: BskyActor }[] }>(
      `${BSKY_API}/app.bsky.feed.getLikes?uri=${uri}&limit=100`,
    ),
    fetchJson<{ repostedBy: BskyActor[] }>(
      `${BSKY_API}/app.bsky.feed.getRepostedBy?uri=${uri}&limit=100`,
    ),
    fetchJson<{ thread: BskyThreadNode }>(
      `${BSKY_API}/app.bsky.feed.getPostThread?uri=${uri}&depth=10`,
    ),
  ]);
  return {
    likes: likes.likes.map((like) => mapBskyActor(like.actor)),
    reposts: reposts.repostedBy.map(mapBskyActor),
    replies: flattenThread(thread.thread, OWN_BSKY_HANDLE),
  };
}

function hasAny(stats: Record<string, number> | undefined): boolean {
  return Object.values(stats ?? {}).some((count) => count > 0);
}

async function refreshMastodon(): Promise<void> {
  const state = loadState("mastodon");
  let count = 0;
  for (const item of Object.values(state.items)) {
    if (item.deleted || !isRecent(item.date)) continue;
    try {
      const status = await fetchJson<{
        favourites_count: number;
        reblogs_count: number;
        replies_count: number;
      }>(`${MASTODON_API}/statuses/${item.id}`);
      Object.assign(
        item,
        statsPatch(item, {
          favs: status.favourites_count,
          boosts: status.reblogs_count,
          replies: status.replies_count,
        }),
      );
      item.interactions = hasAny(item.stats)
        ? await fetchMastodonInteractions(
          item.id,
          MASTODON_API,
          state.meta?.account_id as string | undefined,
        )
        : undefined;
      count++;
    } catch (error) {
      if (`${error}`.includes("404")) item.deleted = true;
      else console.error(`mastodon ${item.id}: ${error}`);
    }
  }
  saveState("mastodon", state);
  console.log(`mastodon: refreshed ${count} items`);
}

async function refreshBluesky(): Promise<void> {
  const state = loadState("bluesky");
  const recent = Object.values(state.items).filter(
    (item) => !item.deleted && isRecent(item.date) && item.extra?.at_uri,
  );
  let count = 0;
  // getPosts accepts up to 25 uris per call
  for (let i = 0; i < recent.length; i += 25) {
    const batch = recent.slice(i, i + 25);
    const uris = batch.map((item) => encodeURIComponent(item.extra!.at_uri as string));
    try {
      const response = await fetchJson<{
        posts: {
          uri: string;
          likeCount: number;
          repostCount: number;
          replyCount: number;
          quoteCount: number;
        }[];
      }>(`${BSKY_API}/app.bsky.feed.getPosts?uris=${uris.join("&uris=")}`);
      const byUri = new Map(response.posts.map((p) => [p.uri, p]));
      for (const item of batch) {
        const post = byUri.get(item.extra!.at_uri as string);
        if (!post) {
          item.deleted = true;
          continue;
        }
        Object.assign(
          item,
          statsPatch(item, {
            likes: post.likeCount,
            reposts: post.repostCount + post.quoteCount,
            replies: post.replyCount,
          }),
        );
        try {
          item.interactions = hasAny(item.stats)
            ? await fetchBskyInteractions(item.extra!.at_uri as string)
            : undefined;
        } catch (error) {
          console.error(`bluesky interactions ${item.id}: ${error}`);
        }
        count++;
      }
    } catch (error) {
      console.error(`bluesky batch: ${error}`);
    }
  }
  saveState("bluesky", state);
  console.log(`bluesky: refreshed ${count} items`);
}

// Repo stats (stars, description, …) on recent GitHub items go stale as a
// one-time snapshot — refresh them alongside the interaction counts.
async function refreshGithub(): Promise<void> {
  const state = loadState("github");
  const token = Deno.env.get("GITHUB_TOKEN") ?? undefined;
  const refreshed = new Set<string>();
  let count = 0;
  for (const item of Object.values(state.items)) {
    const repoName = item.extra?.repo_name as string | undefined;
    if (!repoName || item.deleted || !isRecent(item.date)) continue;
    const repo = await fetchRepoMeta(state, repoName, token, !refreshed.has(repoName));
    refreshed.add(repoName);
    if (repo) item.extra = { ...item.extra, repo };
    count++;
  }
  saveState("github", state);
  console.log(`github: refreshed ${count} items`);
}

// --- Social links on authored items ---------------------------------------
// An authored post can carry `[extra] social = ["<mastodon or bsky URL>", …]`
// (a single string works too). Interactions for those posts are fetched here
// and written to data/social-interactions.json keyed by page path — the
// authored markdown itself is never touched.

export type SocialRef =
  | { network: "mastodon"; api: string; id: string; url: string }
  | { network: "bluesky"; atUri: string; url: string };

export function parseSocialUrl(url: string): SocialRef | null {
  // both canonical mastodon URL shapes, any instance
  const mastodon = url.match(
    /^https?:\/\/([^\/]+)\/(?:@[^\/]+\/|users\/[^\/]+\/statuses\/)(\d+)\/?$/,
  );
  if (mastodon) {
    return {
      network: "mastodon",
      api: `https://${mastodon[1]}/api/v1`,
      id: mastodon[2],
      url,
    };
  }
  // the public XRPC endpoints accept handles inside at-uris
  const bsky = url.match(/^https?:\/\/bsky\.app\/profile\/([^\/]+)\/post\/([^\/]+)\/?$/);
  if (bsky) {
    return {
      network: "bluesky",
      atUri: `at://${bsky[1]}/app.bsky.feed.post/${bsky[2]}`,
      url,
    };
  }
  return null;
}

export function extractSocialLinks(markdown: string): string[] {
  const frontmatter = markdown.match(/^\+\+\+\n([\s\S]*?)\n\+\+\+/)?.[1];
  const line = frontmatter?.match(/^social\s*=\s*(.+)$/m)?.[1];
  if (!line) return [];
  return [...line.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

export function pagePathFor(section: string, filename: string, markdown: string): string {
  // posts carry a path override placing them at /blog/<slug>/
  const path = markdown.match(/^path\s*=\s*"(.+)"$/m)?.[1];
  if (path) return `/${path.replace(/^\/|\/$/g, "")}/`;
  const slug = markdown.match(/^slug\s*=\s*"(.+)"$/m)?.[1] ??
    filename.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, "");
  return `/feed/${section}/${slug}/`;
}

async function fetchSocialEntry(ref: SocialRef) {
  if (ref.network === "mastodon") {
    const status = await fetchJson<{
      favourites_count: number;
      reblogs_count: number;
      replies_count: number;
    }>(`${ref.api}/statuses/${ref.id}`);
    return {
      network: "mastodon",
      url: ref.url,
      stats: {
        favs: status.favourites_count,
        boosts: status.reblogs_count,
        replies: status.replies_count,
      },
      interactions: await fetchMastodonInteractions(ref.id, ref.api),
    };
  }
  const uri = encodeURIComponent(ref.atUri);
  const response = await fetchJson<{
    posts: { likeCount: number; repostCount: number; replyCount: number; quoteCount: number }[];
  }>(`${BSKY_API}/app.bsky.feed.getPosts?uris=${uri}`);
  const post = response.posts[0];
  if (!post) return null;
  return {
    network: "bluesky",
    url: ref.url,
    stats: {
      likes: post.likeCount,
      reposts: post.repostCount + post.quoteCount,
      replies: post.replyCount,
    },
    interactions: await fetchBskyInteractions(ref.atUri),
  };
}

async function refreshSocialLinks(): Promise<void> {
  const sections = ["posts", "reviews", "links", "talks"];
  const result: Record<string, unknown[]> = {};
  let count = 0;
  for (const section of sections) {
    const dir = new URL(`../content/feed/${section}/`, import.meta.url);
    for (const entry of Deno.readDirSync(dir)) {
      if (!entry.name.endsWith(".md") || entry.name === "_index.md") continue;
      const markdown = Deno.readTextFileSync(new URL(entry.name, dir));
      const links = extractSocialLinks(markdown);
      if (!links.length) continue;
      const entries = [];
      for (const link of links) {
        const ref = parseSocialUrl(link);
        if (!ref) {
          console.error(`social: unrecognized URL ${link} in ${entry.name}`);
          continue;
        }
        try {
          const fetched = await fetchSocialEntry(ref);
          if (fetched) entries.push(fetched);
        } catch (error) {
          console.error(`social ${link}: ${error}`);
        }
      }
      if (entries.length) {
        result[pagePathFor(section, entry.name, markdown)] = entries;
        count++;
      }
    }
  }
  Deno.writeTextFileSync(
    new URL("../data/social-interactions.json", import.meta.url),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(`social: ${count} authored items with social links`);
}

if (import.meta.main) {
  await refreshMastodon();
  await refreshBluesky();
  await refreshGithub();
  await refreshSocialLinks();
}
