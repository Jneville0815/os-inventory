/**
 * Latest-version lookups for package registries that have no bulk endpoint, so
 * one request per package. Shared by the sources whose list command reports
 * what's installed but not what's available.
 */

const TIMEOUT_MS = 15_000;
/** Polite ceiling — these are public registries and a user may have dozens of tools. */
const CONCURRENCY = 8;

const USER_AGENT = 'os-inventory (https://github.com/Jneville0815/os-inventory)';

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });

  await Promise.all(runners);
  return results;
}

async function getJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal
    });
    // 404 is ordinary: the package was installed from a git URL or local path,
    // or has been yanked. Anything else is worth a log line but not a failure.
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * PyPI's `info.version` is the latest *stable* release — prereleases stay out of
 * it (django reports 6.1 while 6.1rc1 exists in the index), which is what we want.
 */
export async function pypiLatest(names: string[]): Promise<Map<string, string>> {
  const latest = new Map<string, string>();

  await mapWithConcurrency(names, CONCURRENCY, async (name) => {
    const data = (await getJson(
      `https://pypi.org/pypi/${encodeURIComponent(name)}/json`
    )) as { info?: { version?: string } } | null;
    const version = data?.info?.version;
    if (version) latest.set(name, version);
  });

  return latest;
}

/**
 * The npm registry's `/latest` dist-tag, which by convention excludes
 * prereleases (those live under `next`, `beta`, etc.).
 */
export async function npmLatest(names: string[]): Promise<Map<string, string>> {
  const latest = new Map<string, string>();

  await mapWithConcurrency(names, CONCURRENCY, async (name) => {
    // Scoped names contain a slash that has to survive as part of the path segment.
    const encoded = name.startsWith('@')
      ? `${encodeURIComponent(name.slice(0, name.indexOf('/')))}%2F${encodeURIComponent(name.slice(name.indexOf('/') + 1))}`
      : encodeURIComponent(name);

    const data = (await getJson(`https://registry.npmjs.org/${encoded}/latest`)) as {
      version?: string;
    } | null;
    if (data?.version) latest.set(name, data.version);
  });

  return latest;
}
