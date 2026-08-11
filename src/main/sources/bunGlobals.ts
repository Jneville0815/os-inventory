import type { Package } from '../../shared/types';
import { childEnv } from '../childEnv';
import { execToolAllowExit } from '../exec';
import { requireTool } from '../tools';
import { detectViaTool, type Source } from './source';

/**
 * `bun outdated --global` prints an ASCII table and has no --json (the flag is
 * silently ignored as of bun 1.3):
 *
 *   |--------------------------------------|
 *   | Package  | Current | Update | Latest |
 *   |----------|---------|--------|--------|
 *   | cowsay   | 1.4.0   | 1.4.0  | 1.6.0  |
 *   |--------------------------------------|
 *
 * The version columns must start with a digit — that's what separates real rows
 * from the header ("Current"/"Latest") and the `|-----|` rules, without having
 * to track table position.
 *
 * Only outdated packages appear, so every row is outdated by construction.
 */
const ROW =
  /^\|\s*(?<name>[^|\s]+)\s*\|\s*(?<installed>\d[^|\s]*)\s*\|\s*[^|]*\|\s*(?<latest>\d[^|\s]*)\s*\|$/;

export function parseBunOutdated(stdout: string): Package[] {
  const packages: Package[] = [];
  const seen = new Set<string>();

  for (const line of stdout.split('\n')) {
    const m = ROW.exec(line.trim());
    if (!m?.groups) continue;
    const name = m.groups.name;
    if (seen.has(name)) continue;
    seen.add(name);
    packages.push({
      sourceId: 'bun-global',
      name,
      installedVersion: m.groups.installed,
      latestVersion: m.groups.latest,
      status: 'outdated'
    });
  }

  return packages.sort((a, b) => a.name.localeCompare(b.name));
}

export const bunGlobals: Source = {
  id: 'bun-global',
  label: 'Bun Globals',
  itemNoun: 'packages',
  description: 'Packages installed with `bun add -g`.',
  platforms: ['darwin', 'linux', 'win32'],
  toolId: 'bun',
  hint: 'Install Bun from bun.sh',
  detect: detectViaTool('bun'),

  fetch: async (ctx) => {
    const bun = await requireTool('bun', ctx.settings);
    const stdout = await execToolAllowExit(
      bun,
      ['outdated', '--global'],
      { maxBuffer: 16 * 1024 * 1024, env: childEnv({ NO_COLOR: '1' }) },
      [1]
    );
    return parseBunOutdated(stdout);
  },

  upgradeCommand: (outdated) =>
    outdated.length ? `bun update -g ${outdated.map((p) => p.name).join(' ')}` : ''
};
