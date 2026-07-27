// Tiny RSS 2.0 item extractor. BookWyrm and Letterboxd feeds are simple
// enough that a full XML library isn't warranted; this handles CDATA and
// namespaced elements (e.g. letterboxd:memberRating).

export interface RssItem {
  [key: string]: string;
}

function decodeEntities(text: string): string {
  return text
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function elementText(item: string, tag: string): string | undefined {
  const escaped = tag.replaceAll(":", "\\:");
  const match = item.match(
    new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)</${escaped}>`),
  );
  if (!match) return undefined;
  const inner = match[1].trim();
  const cdata = inner.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  return cdata ? cdata[1].trim() : decodeEntities(inner);
}

export function parseRssItems(xml: string, tags: string[]): RssItem[] {
  const items: RssItem[] = [];
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item: RssItem = {};
    for (const tag of tags) {
      const value = elementText(match[1], tag);
      if (value !== undefined) item[tag] = value;
    }
    items.push(item);
  }
  return items;
}
