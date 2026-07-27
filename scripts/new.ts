// Scaffold a new authored feed item:
//   deno task new post "Some Title"
//   deno task new review "Dune: Part Three"
//   deno task new link "Interesting Article"
//   deno task new talk "My Talk"

const TEMPLATES: Record<string, (title: string) => string> = {
  post: (title) => `+++
title = "${title}"
date = ${today()}
[taxonomies]
tags = []
[extra]
# announcement posts on other networks; their interactions show up here
# social = ["https://chaos.social/@kilian/…", "https://bsky.app/profile/kilian.io/post/…"]
+++

`,
  review: (title) => `+++
title = "${title}"
date = ${today()}
[taxonomies]
tags = []
[extra]
review_type = "movie" # book | movie | tv | game | event
rating = 3.5          # out of 5, halves allowed
# image = "cover.jpg" # colocate next to this file
# link = ""
+++

`,
  link: (title) => `+++
title = "${title}"
date = ${today()}
[extra]
url = ""
# via = ""
+++

`,
  talk: (title) => `+++
title = "${title}"
date = ${today()}
[extra]
event = ""
event_url = ""
# slides = ""
# video = ""
+++

`,
};

const SECTIONS: Record<string, string> = {
  post: "posts",
  review: "reviews",
  link: "links",
  talk: "talks",
};

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replaceAll(/\s+/g, "-");
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

if (import.meta.main) {
  const [type, title] = Deno.args;
  if (!TEMPLATES[type] || !title) {
    console.error(`usage: deno task new <${Object.keys(TEMPLATES).join("|")}> "Title"`);
    Deno.exit(1);
  }
  const filename = `${today()}-${slugify(title)}.md`;
  const path = new URL(
    `../content/feed/${SECTIONS[type]}/${filename}`,
    import.meta.url,
  );
  try {
    Deno.statSync(path);
    console.error(`${filename} already exists`);
    Deno.exit(1);
  } catch (_) {
    // doesn't exist — good
  }
  Deno.writeTextFileSync(path, TEMPLATES[type](title));
  console.log(`created content/feed/${SECTIONS[type]}/${filename}`);
}
