import { assertEquals } from "jsr:@std/assert";
import { convertPost, parseFrontmatter, urlize } from "./migrate-blog.ts";

Deno.test("urlize matches Hugo's behavior for space-containing slugs", () => {
  assertEquals(urlize("wwdc 16"), "wwdc-16");
  assertEquals(urlize("awesome autodesk"), "awesome-autodesk");
  assertEquals(urlize("on quitting facebook"), "on-quitting-facebook");
  assertEquals(urlize("decoding-unknown-data-with-codable"), "decoding-unknown-data-with-codable");
  assertEquals(urlize("Some Title!"), "some-title");
});

Deno.test("parseFrontmatter extracts TOML keys and body", () => {
  const raw = `+++
date = "2021-08-31"
title = "Decoding Unknown Data with Codable"
slug = "decoding-unknown-data-with-codable"
+++

Body text here.
`;
  const { frontmatter, body } = parseFrontmatter(raw);
  assertEquals(frontmatter.date, "2021-08-31");
  assertEquals(frontmatter.title, "Decoding Unknown Data with Codable");
  assertEquals(frontmatter.slug, "decoding-unknown-data-with-codable");
  assertEquals(body.trim(), "Body text here.");
});

Deno.test("convertPost produces Zola frontmatter with urlized slug", () => {
  const raw = `+++
date = "2016-06-14T21:30:00+02:00"
title = "WWDC 16"
slug = "wwdc 16"
+++

Content.
`;
  const result = convertPost(raw);
  assertEquals(
    result,
    `+++
title = "WWDC 16"
date = 2016-06-14T21:30:00+02:00
slug = "wwdc-16"
+++

Content.
`,
  );
});

Deno.test("convertPost strips XML-invalid control characters", () => {
  const raw = `+++
date = "2015-05-07"
title = "Watch"
slug = "watch"
+++

one\x0bbig opinion
`;
  const result = convertPost(raw);
  assertEquals(result.includes("\x0b"), false);
  assertEquals(result.includes("one big opinion"), true);
});

Deno.test("convertPost keeps bare dates and escapes quotes in titles", () => {
  const raw = `+++
date = "2018-07-26"
title = "He said \\"hi\\""
slug = "greeting"
+++

Content.
`;
  const result = convertPost(raw);
  assertEquals(
    result,
    `+++
title = "He said \\"hi\\""
date = 2018-07-26
slug = "greeting"
+++

Content.
`,
  );
});
