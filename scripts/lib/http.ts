const USER_AGENT = "kilko.de feed importer (+https://kilko.de)";

export async function fetchJson<T>(
  url: string,
  headers: Record<string, string> = {},
): Promise<T> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, ...headers },
  });
  if (!response.ok) {
    throw new Error(`GET ${url} → ${response.status}`);
  }
  return await response.json();
}

export async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!response.ok) {
    throw new Error(`GET ${url} → ${response.status}`);
  }
  return await response.text();
}
