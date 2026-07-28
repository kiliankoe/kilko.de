// Scaffold a new authored feed item:
//   deno task new post "Some Title"
//   deno task new review "Dune: Part Three"
//   deno task new link "Interesting Article"
//   deno task new talk "My Talk"
//   deno task new til "Zola sections can be transparent"

const TEMPLATES: Record<string, (title: string, slug: string) => string> = {
  post: (title, slug) => `+++
title = "${title}"
path = "blog/${slug}"
[taxonomies]
tags = []
[extra]
# announcement posts on other networks; their interactions show up here
# social = ["https://chaos.social/@kilian/…", "https://bsky.app/profile/kilian.io/post/…"]
+++

`,
  review: (title) => `+++
title = "${title}"
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
[extra]
url = ""
# via = ""
+++

`,
  talk: (title) => `+++
title = "${title}"
[extra]
event = ""
event_url = ""
# slides = ""
# video = ""
+++

`,
  til: (title) => `+++
title = "${title}"
[taxonomies]
tags = []
+++

`,
};

const SECTIONS: Record<string, string> = {
  post: "blog",
  review: "reviews",
  link: "links",
  talk: "talks",
  til: "til",
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
  const slug = slugify(title);
  const filename = `${today()}-${slug}.md`;
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
  Deno.writeTextFileSync(path, TEMPLATES[type](title, slug));
  console.log(`created content/feed/${SECTIONS[type]}/${filename}`);
}
