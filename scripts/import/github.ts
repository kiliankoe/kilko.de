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
    release?: { html_url: string; tag_name: string; name: string | null };
    pull_request?: {
      html_url: string;
      title: string;
      merged: boolean;
    };
  };
}

// Only genuinely announcement-worthy events: releases, new/open-sourced
// repos, and merged PRs to other people's projects. No pushes, stars, forks.
export function mapEvent(event: GithubEvent): FeedItem | null {
  const repo = event.repo.name;
  const base = { id: event.id, date: event.created_at };

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

export async function importGithub(): Promise<void> {
  const state = loadState("github");
  const token = Deno.env.get("GITHUB_TOKEN");
  const events = await fetchJson<GithubEvent[]>(
    `https://api.github.com/users/${USER}/events/public?per_page=100`,
    token ? { Authorization: `Bearer ${token}` } : {},
  );

  let count = 0;
  for (const event of events) {
    const item = mapEvent(event);
    if (!item) continue;
    state.items[item.id] = { ...state.items[item.id], ...item };
    count++;
  }

  saveState("github", state);
  console.log(`github: ${count} feed-worthy events in window`);
}

if (import.meta.main) await importGithub();
