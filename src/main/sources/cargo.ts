import type { Package } from '../../shared/types';
import { childEnv } from '../childEnv';
import { execTool } from '../exec';
import { requireTool } from '../tools';
import { detectViaTool, statusFor, type Source } from './source';

const CRATES_IO = 'https://crates.io/api/v1/crates';

/**
 * crates.io returns 403 to requests without a descriptive User-Agent — their
 * crawler policy asks for one that identifies the client and offers a way to
 * make contact. Omit this and every lookup silently fails.
 */
const USER_AGENT = 'os-inventory (https://github.com/Jneville0815/os-inventory)';

/** One request per batch rather than per crate, to stay light on their API. */
const BATCH_SIZE = 50;
const TIMEOUT_MS = 15_000;

type InstalledCrate = { name: string; version: string };

/**
 * Parses `cargo install --list`, which prints an unindented `name vX.Y.Z:`
 * header per crate followed by indented binary names:
 *
 *   cargo-edit v0.12.2:
 *       cargo-add
 *       cargo-upgrade
 *   ripgrep v14.1.1:
 *       rg
 */
export function parseCargoList(stdout: string): InstalledCrate[] {
  const header = /^(?<name>\S+)\s+v(?<version>\S+):$/;
  const crates: InstalledCrate[] = [];

  for (const line of stdout.split('\n')) {
    // Indented lines are binary names belonging to the crate above.
    if (/^\s/.test(line)) continue;
    const m = header.exec(line.trim());
    if (m?.groups) {
      crates.push({ name: m.groups.name, version: m.groups.version });
    }
  }
  return crates;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type CratesResponse = {
  crates?: Array<{ name?: string; max_stable_version?: string | null; max_version?: string }>;
};

/**
 * Latest stable version per crate. Unknown names are simply absent from the
 * response, so a git- or path-installed crate just doesn't get a match.
 */
async function fetchLatest(names: string[]): Promise<Map<string, string>> {
  const latest = new Map<string, string>();

  await Promise.all(
    chunk(names, BATCH_SIZE).map(async (batch) => {
      const params = new URLSearchParams({ per_page: String(batch.length) });
      for (const name of batch) params.append('ids[]', name);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(`${CRATES_IO}?${params}`, {
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
          signal: controller.signal
        });
        if (!res.ok) throw new Error(`crates.io returned ${res.status} ${res.statusText}`);

        const data = (await res.json()) as CratesResponse;
        for (const c of data.crates ?? []) {
          // max_stable_version excludes pre-releases; a crate that has only ever
          // published pre-releases has none, so fall back to max_version.
          const version = c.max_stable_version ?? c.max_version;
          if (c.name && version) latest.set(c.name, version);
        }
      } catch (err) {
        // Partial results beat none: other batches may still land, and anything
        // missing reads as "up to date" rather than inventing an update.
        console.error('[cargo] crates.io lookup failed:', err);
      } finally {
        clearTimeout(timer);
      }
    })
  );

  return latest;
}

export const cargoInstall: Source = {
  id: 'cargo-install',
  label: 'Rust Crates',
  itemNoun: 'crates',
  description: 'Binaries installed with `cargo install`.',
  platforms: ['darwin', 'linux', 'win32'],
  toolId: 'cargo',
  hint: 'Install Rust from rustup.rs',
  detect: detectViaTool('cargo'),

  fetch: async (ctx) => {
    const cargo = await requireTool('cargo', ctx.settings);
    const stdout = await execTool(cargo, ['install', '--list'], {
      maxBuffer: 16 * 1024 * 1024,
      env: childEnv({ NO_COLOR: '1' })
    });

    const installed = parseCargoList(stdout);
    if (installed.length === 0) return [];

    ctx.note('checking crates.io');
    const latest = await fetchLatest(installed.map((c) => c.name));

    return installed
      .map<Package>((c) => {
        // No match — crate is unpublished, or was installed from git or a local
        // path. Assume current rather than invent an update.
        const latestVersion = latest.get(c.name) ?? c.version;
        return {
          sourceId: 'cargo-install',
          name: c.name,
          installedVersion: c.version,
          latestVersion,
          status: statusFor(latestVersion, c.version !== latestVersion)
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  upgradeCommand: (outdated) =>
    outdated.length ? `cargo install ${outdated.map((p) => p.name).join(' ')}` : ''
};
