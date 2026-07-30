import { execFile } from 'node:child_process';
import type { Package, RefreshProgress } from '../shared/types';
import { childEnv } from './childEnv';

// Hard-coded for the same reason as BREW_PATH — GUI apps don't inherit the shell PATH.
const NPM_PATH = '/opt/homebrew/bin/npm';

const execOpts = {
  maxBuffer: 32 * 1024 * 1024,
  env: childEnv({ NO_COLOR: '1' })
};

// npm exits 1 when any package is outdated; we still want stdout in that case.
function runNpmAllowStatus1(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(NPM_PATH, args, execOpts, (err, stdout, stderr) => {
      if (err && err.code !== 1) {
        reject(new Error(stderr || err.message));
        return;
      }
      resolve(stdout);
    });
  });
}

type NpmLs = {
  dependencies?: Record<string, { version: string }>;
};

type NpmOutdated = Record<
  string,
  { current?: string; wanted?: string; latest?: string }
>;

export async function fetchNpmGlobals(
  onProgress: (p: RefreshProgress) => void
): Promise<Package[]> {
  onProgress({ phase: 'querying-npm' });

  const [lsRaw, outdatedRaw] = await Promise.all([
    runNpmAllowStatus1(['ls', '-g', '--json', '--depth=0']),
    runNpmAllowStatus1(['outdated', '-g', '--json'])
  ]);

  const ls = JSON.parse(lsRaw) as NpmLs;
  const outdated = (outdatedRaw.trim() ? JSON.parse(outdatedRaw) : {}) as NpmOutdated;

  const deps = ls.dependencies ?? {};

  return Object.entries(deps)
    .map<Package>(([name, info]) => {
      const o = outdated[name];
      const installed = o?.current ?? info.version;
      const latest = o?.latest ?? info.version;
      return {
        kind: 'npm-global',
        name,
        installedVersion: installed,
        latestVersion: latest,
        outdated: Boolean(o) && installed !== latest
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
