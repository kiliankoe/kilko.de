// Runs all importers (continuing past per-source failures), then regenerates
// the markdown under content/feed/. Order matters: Mastodon before Bluesky,
// since cross-post dedup matches new Bluesky posts against Mastodon items.

import { importMastodon } from "./import/mastodon.ts";
import { importBluesky } from "./import/bluesky.ts";
import { importGithub } from "./import/github.ts";
import { importBookwyrm } from "./import/bookwyrm.ts";
import { importLetterboxd } from "./import/letterboxd.ts";

const importers: [string, () => Promise<void>][] = [
  ["mastodon", importMastodon],
  ["bluesky", importBluesky],
  ["github", importGithub],
  ["bookwyrm", importBookwyrm],
  ["letterboxd", importLetterboxd],
];

let failures = 0;
for (const [name, run] of importers) {
  try {
    await run();
  } catch (error) {
    failures++;
    console.error(`${name}: FAILED — ${error}`);
  }
}

const generate = new Deno.Command(Deno.execPath(), {
  args: ["run", "--allow-read", "--allow-write", "scripts/generate-content.ts"],
}).outputSync();
console.log(new TextDecoder().decode(generate.stdout).trim());
if (!generate.success) {
  console.error(new TextDecoder().decode(generate.stderr));
  Deno.exit(1);
}

if (failures === importers.length) Deno.exit(1);
