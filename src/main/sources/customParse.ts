import type { CustomSourceMode, Package, SourceId } from '../../shared/types';
import { statusFor } from './source';

/** Guards against a runaway command flooding the UI. */
const MAX_ROWS = 5000;

type Row = { name: string; installed?: string; latest?: string };

function toPackage(sourceId: SourceId, row: Row): Package | null {
  const name = row.name?.trim();
  if (!name) return null;

  const installedVersion = row.installed?.trim() ?? '';
  const latestVersion = row.latest?.trim() ?? '';
  // With no latest version there's nothing to compare, so the row reads
  // "unknown" rather than falsely claiming it's current.
  const outdated =
    Boolean(installedVersion) && Boolean(latestVersion) && installedVersion !== latestVersion;

  return {
    sourceId,
    name,
    installedVersion,
    latestVersion,
    status: statusFor(latestVersion, outdated)
  };
}

function finish(sourceId: SourceId, rows: Row[]): Package[] {
  const seen = new Set<string>();
  const packages: Package[] = [];
  for (const row of rows.slice(0, MAX_ROWS)) {
    const pkg = toPackage(sourceId, row);
    // PackageTable keys on name; duplicates would collide in React.
    if (!pkg || seen.has(pkg.name)) continue;
    seen.add(pkg.name);
    packages.push(pkg);
  }
  return packages.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Applies `pattern` to each line, reading the named groups `name`, `installed`
 * and `latest`. Lines that don't match are skipped, which is what makes this
 * work against real CLI output full of headers and blank lines.
 */
export function parseRegexOutput(
  stdout: string,
  pattern: string,
  sourceId: SourceId
): Package[] {
  // Constructed per call rather than cached: `lastIndex` on a reused global
  // regex would make matching depend on call order.
  const re = new RegExp(pattern);
  const rows: Row[] = [];

  for (const line of stdout.split('\n')) {
    const m = re.exec(line.trimEnd());
    if (!m?.groups) continue;
    rows.push({
      name: m.groups.name,
      installed: m.groups.installed,
      latest: m.groups.latest
    });
  }
  return finish(sourceId, rows);
}

/** `name<TAB>installed<TAB>latest` per line. Blank lines and `#` comments skipped. */
export function parseTsvOutput(stdout: string, sourceId: SourceId): Package[] {
  const rows: Row[] = [];
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [name, installed, latest] = line.split('\t');
    rows.push({ name, installed, latest });
  }
  return finish(sourceId, rows);
}

/** A JSON array of `{ name, installed, latest }`. Throws on malformed JSON. */
export function parseJsonOutput(stdout: string, sourceId: SourceId): Package[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];

  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    throw new Error('Command did not print valid JSON');
  }
  if (!Array.isArray(data)) {
    throw new Error('Expected a JSON array of { name, installed, latest } objects');
  }

  const rows = data.map((entry): Row => {
    const o = (entry ?? {}) as Record<string, unknown>;
    const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
    return {
      name: str(o.name) ?? '',
      installed: str(o.installed) ?? str(o.version),
      latest: str(o.latest)
    };
  });
  return finish(sourceId, rows);
}

export function parseCustomOutput(
  stdout: string,
  mode: CustomSourceMode,
  pattern: string | undefined,
  sourceId: SourceId
): Package[] {
  switch (mode) {
    case 'regex':
      if (!pattern) throw new Error('This source is set to regex mode but has no pattern');
      return parseRegexOutput(stdout, pattern, sourceId);
    case 'tsv':
      return parseTsvOutput(stdout, sourceId);
    case 'json':
      return parseJsonOutput(stdout, sourceId);
  }
}
