import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Package, RefreshProgress } from '../shared/types';

const execFileAsync = promisify(execFile);

// Hard-coded — GUI apps on macOS don't inherit the shell's PATH, so
// relying on $PATH-based brew resolution doesn't work when launched from Finder.
const BREW_PATH = '/opt/homebrew/bin/brew';

const execOpts = {
  maxBuffer: 64 * 1024 * 1024,
  env: {
    ...process.env,
    HOMEBREW_NO_AUTO_UPDATE: '1',
    HOMEBREW_NO_ENV_HINTS: '1',
    HOMEBREW_NO_ANALYTICS: '1'
  }
};

async function runBrew(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(BREW_PATH, args, execOpts);
  return stdout;
}

type BrewInfoPayload = {
  formulae: Array<{
    name: string;
    desc?: string;
    versions: { stable: string | null };
    installed: Array<{ version: string }>;
    outdated: boolean;
    pinned: boolean;
  }>;
  casks: Array<{
    token: string;
    name?: string[];
    desc?: string;
    version: string | null;
    installed: string | null;
    outdated: boolean;
    auto_updates: boolean | null;
    artifacts?: Array<Record<string, unknown>>;
  }>;
};

function collectCaskAppNames(casks: BrewInfoPayload['casks']): Set<string> {
  const names = new Set<string>();
  for (const c of casks) {
    for (const art of c.artifacts ?? []) {
      const appEntry = art['app'];
      if (!Array.isArray(appEntry)) continue;
      for (const item of appEntry) {
        if (typeof item === 'string' && item.endsWith('.app')) {
          names.add(item);
        }
      }
    }
  }
  return names;
}

export async function fetchInstalled(
  onProgress: (p: RefreshProgress) => void
): Promise<{ formulae: Package[]; casks: Package[]; caskAppNames: Set<string> }> {
  onProgress({ phase: 'updating-taps' });
  await runBrew(['update', '--quiet']);

  onProgress({ phase: 'querying-brew' });
  const raw = await runBrew(['info', '--json=v2', '--installed']);
  const parsed = JSON.parse(raw) as BrewInfoPayload;

  const formulae: Package[] = parsed.formulae
    .map((f) => ({
      kind: 'formula' as const,
      name: f.name,
      description: f.desc,
      installedVersion: f.installed[0]?.version ?? '',
      latestVersion: f.versions.stable ?? '',
      outdated: f.outdated,
      pinned: f.pinned
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const casks: Package[] = parsed.casks
    .map((c) => ({
      kind: 'cask' as const,
      name: c.token,
      displayName: c.name?.[0],
      description: c.desc,
      installedVersion: c.installed ?? '',
      latestVersion: c.version ?? '',
      outdated: c.outdated,
      autoUpdates: c.auto_updates ?? false
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { formulae, casks, caskAppNames: collectCaskAppNames(parsed.casks) };
}
