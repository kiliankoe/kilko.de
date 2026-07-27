// Mirrors media from Kilian's own network posts into static/media/ so the
// site doesn't hotlink instance CDNs (whose URLs rot when media is pruned).
// Third-party artwork (book covers, film posters) is deliberately NOT
// mirrored — rehosting other people's images is a copyright gray zone, own
// photos are not.

const MEDIA_ROOT = new URL("../../static/media/", import.meta.url);

// GitHub hard-rejects files over 100 MB (and warns from 50); big videos stay
// hotlinked rather than bloating the repo.
const MAX_BYTES = 30 * 1024 * 1024;

export function extensionFor(url: string): string {
  // bluesky CDN encodes the format after an @ (…/…@jpeg)
  const bskyStyle = url.match(/@(jpe?g|png|gif|webp|avif)$/i);
  if (bskyStyle) return `.${bskyStyle[1].toLowerCase().replace("jpeg", "jpg")}`;
  const pathStyle = new URL(url).pathname.match(/\.(jpe?g|png|gif|webp|avif|mp4)$/i);
  if (pathStyle) return `.${pathStyle[1].toLowerCase().replace("jpeg", "jpg")}`;
  return ".jpg";
}

export function localMediaPath(source: string, itemId: string, index: number, originUrl: string): string {
  return `/media/${source}/${itemId}-${index}${extensionFor(originUrl)}`;
}

export async function mirrorMedia(
  source: string,
  itemId: string,
  media: { url: string; alt?: string }[],
): Promise<{ url: string; alt?: string }[]> {
  const result: { url: string; alt?: string }[] = [];
  for (const [index, entry] of media.entries()) {
    // already rewritten on a previous run
    if (entry.url.startsWith("/media/")) {
      result.push(entry);
      continue;
    }
    const localPath = localMediaPath(source, itemId, index, entry.url);
    const file = new URL(`${source}/${itemId}-${index}${extensionFor(entry.url)}`, MEDIA_ROOT);
    try {
      Deno.statSync(file);
      result.push({ ...entry, url: localPath });
      continue; // already downloaded
    } catch (_) {
      // not yet downloaded
    }
    try {
      const response = await fetch(entry.url);
      if (!response.ok) throw new Error(`${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > MAX_BYTES) {
        console.log(`media ${entry.url}: ${Math.round(bytes.byteLength / 1024 / 1024)} MB > cap — keeping origin URL`);
        result.push(entry);
        continue;
      }
      Deno.mkdirSync(new URL(`${source}/`, MEDIA_ROOT), { recursive: true });
      Deno.writeFileSync(file, bytes);
      result.push({ ...entry, url: localPath });
    } catch (error) {
      console.error(`media ${entry.url}: ${error} — keeping origin URL`);
      result.push(entry);
    }
  }
  return result;
}
