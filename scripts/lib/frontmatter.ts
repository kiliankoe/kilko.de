// Minimal TOML serializer for the generated feed-item frontmatter. Only the
// shapes we actually emit are supported (strings, numbers, booleans, dates,
// flat inline tables, arrays of flat inline tables).

export function tomlString(value: string): string {
  return `"${
    value
      .replaceAll("\\", "\\\\")
      .replaceAll('"', '\\"')
      .replaceAll("\n", "\\n")
      .replaceAll("\r", "\\r")
      .replaceAll("\t", "\\t")
      // control chars are invalid in TOML basic strings (and in XML feeds)
      .replaceAll(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, " ")
  }"`;
}

export function tomlValue(value: unknown): string {
  if (typeof value === "string") return tomlString(value);
  if (typeof value === "number" || typeof value === "boolean") return `${value}`;
  if (Array.isArray(value)) return `[${value.map(tomlValue).join(", ")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k} = ${tomlValue(v)}`);
    return `{ ${entries.join(", ")} }`;
  }
  throw new Error(`cannot serialize ${typeof value} to TOML`);
}

export interface GeneratedFrontmatter {
  title: string;
  date: string; // ISO 8601, written as a bare TOML datetime
  slug: string;
  extra: Record<string, unknown>;
}

export function renderFrontmatter(fm: GeneratedFrontmatter): string {
  const lines = [
    "+++",
    `title = ${tomlString(fm.title)}`,
    `date = ${fm.date}`,
    `slug = ${tomlString(fm.slug)}`,
    "[extra]",
  ];
  for (const [key, value] of Object.entries(fm.extra)) {
    if (value === undefined || value === null) continue;
    lines.push(`${key} = ${tomlValue(value)}`);
  }
  lines.push("+++", "");
  return lines.join("\n");
}
