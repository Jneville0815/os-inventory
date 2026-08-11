import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Package } from '../../shared/types';
import { childEnv } from '../childEnv';
import { requireTool } from '../tools';
import { detectViaTool, statusFor, type Source } from './source';

const execFileAsync = promisify(execFile);

const MARKETPLACE_URL =
  'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery';

// flags=17 = IncludeVersions (1) | IncludeVersionProperties (16). We need the
// full version history plus each version's properties so we can skip pre-release
// builds (marked by "Microsoft.VisualStudio.Code.PreRelease" = "true") and pick
// the newest stable version. IncludeLatestVersionOnly (512) would collapse to a
// single entry that might be a pre-release, causing spurious "outdated" markers
// for users on the stable track.
const MARKETPLACE_FLAGS = 17;

const PRERELEASE_PROPERTY_KEY = 'Microsoft.VisualStudio.Code.PreRelease';
const ENGINE_PROPERTY_KEY = 'Microsoft.VisualStudio.Code.Engine';

type InstalledExtension = { id: string; version: string };

type MarketplaceVersion = {
  version: string;
  properties?: Array<{ key: string; value: string }>;
};

type MarketplaceExtension = {
  publisher: { publisherName: string };
  extensionName: string;
  displayName?: string;
  shortDescription?: string;
  versions: MarketplaceVersion[];
};

type MarketplaceResponse = {
  results: Array<{ extensions: MarketplaceExtension[] }>;
};

// Caret range check. VS Code engine strings are always `^X.Y.Z` — caret means
// same major, with [minor, patch] >= required. If the format is unrecognized
// (rare), assume compatible rather than hide a legitimate update.
export function satisfiesEngine(engine: string, installed: number[]): boolean {
  const m = engine.match(/^\^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return true;
  const req = [+m[1], +m[2], +m[3]];
  if (installed[0] !== req[0]) return false;
  if (installed[1] !== req[1]) return installed[1] > req[1];
  return installed[2] >= req[2];
}

function parseVersion(v: string): number[] {
  return v
    .split('.')
    .slice(0, 3)
    .map((n) => Number(n) || 0);
}

/**
 * Newest version that is neither a pre-release nor requires a newer editor than
 * the installed one — flagging a version VS Code would silently refuse to
 * install makes the app's "outdated" claim wrong.
 */
export function latestStableVersion(
  versions: MarketplaceVersion[],
  installedCode: number[]
): string | undefined {
  for (const v of versions) {
    const props = v.properties ?? [];
    if (props.some((p) => p.key === PRERELEASE_PROPERTY_KEY && p.value === 'true')) continue;
    const engine = props.find((p) => p.key === ENGINE_PROPERTY_KEY)?.value;
    if (engine && !satisfiesEngine(engine, installedCode)) continue;
    return v.version;
  }
  return undefined;
}

async function getInstalledCodeVersion(code: string): Promise<number[]> {
  const { stdout } = await execFileAsync(code, ['--version'], {
    maxBuffer: 64 * 1024,
    env: childEnv()
  });
  return parseVersion(stdout.split('\n')[0]?.trim() ?? '');
}

async function listInstalled(code: string): Promise<InstalledExtension[]> {
  const { stdout } = await execFileAsync(code, ['--list-extensions', '--show-versions'], {
    maxBuffer: 4 * 1024 * 1024,
    env: childEnv()
  });
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const at = line.lastIndexOf('@');
      if (at === -1) return { id: line, version: '' };
      return { id: line.slice(0, at), version: line.slice(at + 1) };
    });
}

async function queryMarketplace(ids: string[]): Promise<Map<string, MarketplaceExtension>> {
  if (ids.length === 0) return new Map();

  const res = await fetch(MARKETPLACE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json;api-version=3.0-preview.1'
    },
    body: JSON.stringify({
      filters: [{ criteria: ids.map((value) => ({ filterType: 7, value })) }],
      flags: MARKETPLACE_FLAGS
    })
  });

  if (!res.ok) {
    throw new Error(`VS Code Marketplace returned ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as MarketplaceResponse;
  const map = new Map<string, MarketplaceExtension>();
  for (const e of data.results[0]?.extensions ?? []) {
    map.set(`${e.publisher.publisherName}.${e.extensionName}`.toLowerCase(), e);
  }
  return map;
}

export const vscodeExtensions: Source = {
  id: 'vscode-extension',
  label: 'VS Code Extensions',
  itemNoun: 'extensions',
  description: 'Extensions installed in Visual Studio Code.',
  platforms: ['darwin', 'linux', 'win32'],
  toolId: 'code',
  hint: "Install VS Code, then run “Shell Command: Install 'code' command in PATH”",
  detect: detectViaTool('code'),

  fetch: async (ctx) => {
    const code = await requireTool('code', ctx.settings);

    const [installed, installedCode] = await Promise.all([
      listInstalled(code),
      getInstalledCodeVersion(code)
    ]);
    if (installed.length === 0) return [];

    ctx.note('querying marketplace');
    let marketplace: Map<string, MarketplaceExtension>;
    try {
      marketplace = await queryMarketplace(installed.map((e) => e.id));
    } catch (err) {
      // Fall back to showing installed versions only rather than failing the
      // source outright — a dead network shouldn't empty the tab.
      console.error('[vscode] marketplace query failed:', err);
      marketplace = new Map();
    }

    return installed
      .map<Package>((ext) => {
        const mp = marketplace.get(ext.id.toLowerCase());
        const latest = (mp && latestStableVersion(mp.versions, installedCode)) ?? ext.version;
        return {
          sourceId: 'vscode-extension',
          name: ext.id,
          displayName: mp?.displayName,
          description: mp?.shortDescription,
          installedVersion: ext.version,
          latestVersion: latest,
          status: statusFor(latest, Boolean(ext.version) && latest !== ext.version)
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  upgradeCommand: (outdated) => (outdated.length ? 'code --update-extensions' : '')
};
