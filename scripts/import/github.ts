// Imports feed-worthy public GitHub activity for @kiliankoe. The events API
// only covers ~90 days / 300 events — the state file preserves older history.

import { fetchJson } from "../lib/http.ts";
import { escapeHtml } from "./bluesky.ts";
import { type FeedItem, loadState, saveState } from "../lib/model.ts";

const USER = "kiliankoe";

interface GithubEvent {
  id: string;
  type: string;
  created_at: string;
  repo: { name: string };
  payload: {
    action?: string;
    ref_type?: string;
    description?: string | null;
    release?: {
      html_url: string;
      tag_name: string;
      name: string | null;
      body?: string | null;
    };
    pull_request?: {
      html_url: string;
      title: string;
      merged: boolean;
    };
  };
}

export interface RepoMeta {
  name: string;
  description?: string;
  language?: string;
  stars: number;
  forks: number;
  topics?: string[];
  homepage?: string;
  license?: string;
}

const NOTES_LIMIT = 500;

// Release notes are markdown; rendered as escaped plain text with breaks —
// good enough for a feed preview, the full notes are one click away.
export function releaseNotesHtml(body: string | null | undefined): string | undefined {
  const text = body?.trim();
  if (!text) return undefined;
  const truncated = text.length > NOTES_LIMIT ? `${text.slice(0, NOTES_LIMIT)}…` : text;
  return `<p>${escapeHtml(truncated).replaceAll(/\r?\n/g, "<br>")}</p>`;
}

// Only genuinely announcement-worthy events: releases, new/open-sourced
// repos, and merged PRs to other people's projects. No pushes, stars, forks.
export function mapEvent(event: GithubEvent): FeedItem | null {
  const repo = event.repo.name;
  const base = {
    id: event.id,
    date: event.created_at,
    extra: { repo_name: repo },
  };

  switch (event.type) {
    case "ReleaseEvent": {
      if (event.payload.action !== "published") return null;
      const release = event.payload.release!;
      const name = release.name && release.name !== release.tag_name
        ? ` — ${release.name}`
        : "";
      return {
        ...base,
        url: release.html_url,
        title: `Released ${repo} ${release.tag_name}${name}`,
        content_html: releaseNotesHtml(release.body),
      };
    }
    case "CreateEvent": {
      if (event.payload.ref_type !== "repository") return null;
      return {
        ...base,
        url: `https://github.com/${repo}`,
        title: `Created ${repo}`,
        content_html: event.payload.description
          ? `<p>${escapeHtml(event.payload.description)}</p>`
          : undefined,
      };
    }
    case "PublicEvent":
      return {
        ...base,
        url: `https://github.com/${repo}`,
        title: `Open-sourced ${repo}`,
      };
    case "PullRequestEvent": {
      const pr = event.payload.pull_request;
      if (event.payload.action !== "closed" || !pr?.merged) return null;
      if (repo.startsWith(`${USER}/`)) return null;
      return {
        ...base,
        url: pr.html_url,
        title: `Merged PR in ${repo}: ${pr.title}`,
      };
    }
    default:
      return null;
  }
}

// Repo metadata (description, language, stars, …) via one cached call per
// repo. Pass fresh = true to bypass the cache (stats refresh for recent items).
export async function fetchRepoMeta(
  state: ReturnType<typeof loadState>,
  repoName: string,
  token: string | undefined,
  fresh = false,
): Promise<RepoMeta | null> {
  state.meta ??= {};
  const cache = (state.meta.repos ??= {}) as Record<string, RepoMeta | null>;
  if (!fresh && repoName in cache) return cache[repoName];
  try {
    const repo = await fetchJson<{
      description: string | null;
      language: string | null;
      stargazers_count: number;
      forks_count: number;
      topics?: string[];
      homepage: string | null;
      license: { spdx_id: string } | null;
    }>(
      `https://api.github.com/repos/${repoName}`,
      token ? { Authorization: `Bearer ${token}` } : {},
    );
    cache[repoName] = {
      name: repoName,
      description: repo.description ?? undefined,
      language: repo.language ?? undefined,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      topics: repo.topics?.length ? repo.topics : undefined,
      homepage: repo.homepage || undefined,
      license: repo.license?.spdx_id && repo.license.spdx_id !== "NOASSERTION"
        ? repo.license.spdx_id
        : undefined,
    };
  } catch (error) {
    console.error(`github repo ${repoName}: ${error}`);
    return null; // not cached — retried next run
  }
  return cache[repoName];
}

export async function importGithub(): Promise<void> {
  const state = loadState("github");
  const token = Deno.env.get("GITHUB_TOKEN");
  // the API caps at 300 events / 90 days; on active days a single page
  // covers mere hours, so always walk all three
  const events: GithubEvent[] = [];
  for (let page = 1; page <= 3; page++) {
    const batch = await fetchJson<GithubEvent[]>(
      `https://api.github.com/users/${USER}/events/public?per_page=100&page=${page}`,
      token ? { Authorization: `Bearer ${token}` } : {},
    );
    events.push(...batch);
    if (batch.length < 100) break;
  }

  let count = 0;
  for (const event of events) {
    const item = mapEvent(event);
    if (!item) continue;
    state.items[item.id] = { ...state.items[item.id], ...item };
    count++;
  }

  for (const item of Object.values(state.items)) {
    const repoName = item.extra?.repo_name as string | undefined;
    if (!repoName) continue;
    const repo = await fetchRepoMeta(state, repoName, token);
    if (repo) item.extra = { ...item.extra, repo };
  }

  saveState("github", state);
  console.log(`github: ${count} feed-worthy events in window`);
}

if (import.meta.main) await importGithub();
