// HTML scrubber for content coming from external networks, ported from the
// client-side sanitizer in akronymisier.bar (templates/episode.html) to
// deno-dom so sanitizing happens once at import time.

import { DOMParser, Element } from "jsr:@b-fuze/deno-dom";

const FORBIDDEN_TAGS = ["script", "style", "iframe", "object", "embed", "form"];
const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ["href", "rel", "class"],
  img: ["src", "alt", "loading"],
  span: ["class"],
};

export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(
    `<body>${html}</body>`,
    "text/html",
  );
  const body = doc.querySelector("body")!;

  for (const tag of FORBIDDEN_TAGS) {
    body.querySelectorAll(tag).forEach((el) => (el as Element).remove());
  }

  body.querySelectorAll("*").forEach((node) => {
    const el = node as Element;
    const allowed = ALLOWED_ATTRIBUTES[el.tagName.toLowerCase()] ?? [];
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || !allowed.includes(name)) {
        el.removeAttribute(attr.name);
      }
    }
    // javascript: etc. — only keep http(s) links
    if (el.tagName === "A") {
      const href = el.getAttribute("href") ?? "";
      if (!/^https?:\/\//i.test(href)) el.removeAttribute("href");
      else el.setAttribute("rel", "nofollow noopener");
    }
  });

  return body.innerHTML;
}

export function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(
    `<body>${html}</body>`,
    "text/html",
  );
  return doc.querySelector("body")!.textContent ?? "";
}
