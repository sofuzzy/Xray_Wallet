export interface FetchJsonOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
}

/**
 * Fetch JSON with a timeout. Returns null on non-2xx responses or network/timeout errors.
 * Keep callers resilient: upstream APIs are best-effort.
 */
export async function fetchJson<T = any>(
  url: string,
  opts: FetchJsonOptions = {},
): Promise<T | null> {
  const timeoutMs = opts.timeoutMs ?? 8000;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: opts.headers,
      signal: controller.signal,
    });

    if (!resp.ok) return null;
    return (await resp.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(id);
  }
}
