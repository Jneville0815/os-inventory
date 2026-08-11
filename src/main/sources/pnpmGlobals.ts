import type { Package } from '../../shared/types';
import { childEnv } from '../childEnv';
import { execToolAllowExit } from '../exec';
import { requireTool } from '../tools';
import { detectViaTool, statusFor, type Source } from './source';

/** `pnpm ls -g --json` → an array of roots, each with a dependencies map. */
type PnpmLs = Array<{ dependencies?: Record<string, { version?: string }> }>;

/** `pnpm outdated -g --format=json` → the same shape npm's outdated uses. */
type PnpmOutdated = Record<string, { current?: string; latest?: string; wanted?: string }>;

/**
 * Merges the full global list with the outdated report, so the tab shows
 * everything installed rather than only what needs attention — matching how the
 * npm globals source behaves.
 */
export function mergePnpmGlobals(ls: PnpmLs, outdated: PnpmOutdated): Package[] {
  const installed = new Map<string, string>();
  for (const root of ls) {
    for (const [name, info] of Object.entries(root.dependencies ?? {})) {
      if (info.version) installed.set(name, info.version);
    }
  }

  return [...installed.entries()]
    .map<Package>(([name, version]) => {
      const o = outdated[name];
      const installedVersion = o?.current ?? version;
      const latestVersion = o?.latest ?? version;
      return {
        sourceId: 'pnpm-global',
        name,
        installedVersion,
        latestVersion,
        status: statusFor(latestVersion, Boolean(o) && installedVersion !== latestVersion)
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const pnpmGlobals: Source = {
  id: 'pnpm-global',
  label: 'pnpm Globals',
  itemNoun: 'packages',
  description: 'Packages installed with `pnpm add -g`.',
  platforms: ['darwin', 'linux', 'win32'],
  toolId: 'pnpm',
  hint: 'Install pnpm from pnpm.io',
  detect: detectViaTool('pnpm'),

  fetch: async (ctx) => {
    const pnpm = await requireTool('pnpm', ctx.settings);
    const opts = { maxBuffer: 32 * 1024 * 1024, env: childEnv({ NO_COLOR: '1' }) };

    const [lsRaw, outdatedRaw] = await Promise.all([
      // Both exit 1 by design: `ls` when the global root is empty, `outdated`
      // whenever anything is out of date.
      execToolAllowExit(pnpm, ['ls', '-g', '--json'], opts, [1]),
      execToolAllowExit(pnpm, ['outdated', '-g', '--format=json'], opts, [1])
    ]);

    const ls = (lsRaw.trim() ? JSON.parse(lsRaw) : []) as PnpmLs;
    const outdated = (outdatedRaw.trim() ? JSON.parse(outdatedRaw) : {}) as PnpmOutdated;
    return mergePnpmGlobals(Array.isArray(ls) ? ls : [ls], outdated);
  },

  upgradeCommand: (outdated) => (outdated.length ? 'pnpm update -g --latest' : '')
};
