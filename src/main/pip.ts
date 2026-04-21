import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Package, RefreshProgress } from '../shared/types';

const execFileAsync = promisify(execFile);

// Hard-coded to brew-installed Python for the same reason as BREW_PATH / NPM_PATH:
// GUI apps on macOS don't inherit the shell's PATH. This tracks the packages installed
// into the Homebrew Python site-packages only — pyenv/asdf Pythons are out of scope for v0.
const PIP_PATH = '/opt/homebrew/bin/pip3';

const execOpts = {
  maxBuffer: 32 * 1024 * 1024,
  env: { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1', NO_COLOR: '1' }
};

async function runPip(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(PIP_PATH, args, execOpts);
  return stdout;
}

type PipListEntry = { name: string; version: string };
type PipOutdatedEntry = {
  name: string;
  version: string;
  latest_version: string;
};

export async function fetchPipGlobals(
  onProgress: (p: RefreshProgress) => void
): Promise<Package[]> {
  onProgress({ phase: 'querying-pip' });

  const [listRaw, outdatedRaw] = await Promise.all([
    runPip(['list', '--format=json']),
    runPip(['list', '--outdated', '--format=json'])
  ]);

  const installed = JSON.parse(listRaw) as PipListEntry[];
  const outdated = JSON.parse(outdatedRaw) as PipOutdatedEntry[];
  const outdatedByName = new Map(outdated.map((e) => [e.name, e]));

  return installed
    .map<Package>((pkg) => {
      const o = outdatedByName.get(pkg.name);
      return {
        kind: 'pip-global',
        name: pkg.name,
        installedVersion: pkg.version,
        latestVersion: o?.latest_version ?? pkg.version,
        outdated: Boolean(o) && pkg.version !== o?.latest_version
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
