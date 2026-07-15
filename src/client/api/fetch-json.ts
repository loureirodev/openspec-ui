/** Fetches `path` and parses its JSON body, throwing when the response itself was not `ok`. */
export async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`The dashboard server returned ${response.status} for ${path}.`);
  }
  return (await response.json()) as T;
}
