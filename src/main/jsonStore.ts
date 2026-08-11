import { promises as fs } from 'node:fs';

/** Returns null when the file is missing or holds unparseable JSON. */
export async function readJsonFile<T>(path: string): Promise<T | null> {
  let raw: string;
  try {
    raw = await fs.readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    // A truncated or hand-edited file shouldn't be fatal — treat it as absent
    // and let the caller fall back to defaults.
    console.error(`[store] ignoring unparseable JSON at ${path}`);
    return null;
  }
}

/** Write via temp file + rename so a crash mid-write can't leave a partial file. */
export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const tmp = `${path}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(tmp, path);
}
