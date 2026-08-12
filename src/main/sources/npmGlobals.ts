import type { Package } from '../../shared/types';
import { childEnv } from '../childEnv';
import { execToolAllowExit } from '../exec';
import { requireTool } from '../tools';
import { detectViaTool, statusFor, type Source } from './source';

const execOpts = {
  maxBuffer: 32 * 1024 * 1024,
  env: childEnv({ NO_COLOR: '1' })
};

// `npm outdated` exits 1 when anything is outdated; we still want its stdout.
function runNpm(npm: string, args: string[]): Promise<string> {
  return execToolAllowExit(npm, args, execOpts, [1]);
}

type NpmLs = { dependencies?: Record<string, { version: string }> };
type NpmOutdated = Record<string, { current?: string; wanted?: string; latest?: string }>;

/**
 * Overlays `npm outdated` onto `npm ls`. Anything absent from `outdated` is
 * current by definition, so installed === latest.
 */
export function mergeNpmGlobals(ls: NpmLs, outdated: NpmOutdated): Package[] {
  return Object.entries(ls.dependencies ?? {})
    .map<Package>(([name, info]) => {
      const o = outdated[name];
      const installed = o?.current ?? info.version;
      const latest = o?.latest ?? info.version;
      // Defensive: npm's outdated reporting can be weirdly inclusive — it lists
      // packages whose current already equals latest. Only believe it when the
      // versions genuinely differ.
      return {
        sourceId: 'npm-global',
        name,
        installedVersion: installed,
        latestVersion: latest,
        status: statusFor(latest, Boolean(o) && installed !== latest)
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const npmGlobals: Source = {
  id: 'npm-global',
  label: 'npm Globals',
  itemNoun: 'packages',
  description: 'Packages installed with `npm install -g`.',
  toolId: 'npm',
  hint: 'Install Node.js from nodejs.org',
  detect: detectViaTool('npm'),

  fetch: async (ctx) => {
    const npm = await requireTool('npm', ctx.settings);

    const [lsRaw, outdatedRaw] = await Promise.all([
      runNpm(npm, ['ls', '-g', '--json', '--depth=0']),
      runNpm(npm, ['outdated', '-g', '--json'])
    ]);

    const ls = JSON.parse(lsRaw) as NpmLs;
    const outdated = (outdatedRaw.trim() ? JSON.parse(outdatedRaw) : {}) as NpmOutdated;

    return mergeNpmGlobals(ls, outdated);
  },

  upgradeCommand: (outdated) => (outdated.length ? 'npm update -g' : '')
};
