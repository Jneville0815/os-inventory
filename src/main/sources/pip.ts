import type { Package } from '../../shared/types';
import { childEnv } from '../childEnv';
import { execTool } from '../exec';
import { requireTool } from '../tools';
import { detectViaTool, statusFor, type Source } from './source';

/**
 * `pip list --outdated --format=json` reports installed and latest together, so
 * there's no registry call to make. Field names are pip's own:
 *
 *   [{"name": "packaging", "version": "26.1", "latest_version": "26.3", …}]
 *
 * Packages that are current simply aren't listed, which is why this tab shows
 * only what needs attention.
 */
type PipOutdated = Array<{
  name?: string;
  version?: string;
  latest_version?: string;
}>;

export function toPipPackages(entries: PipOutdated): Package[] {
  return entries
    .filter((e) => typeof e.name === 'string' && e.name.trim())
    .map<Package>((e) => {
      const installedVersion = e.version?.trim() ?? '';
      const latestVersion = e.latest_version?.trim() ?? '';
      return {
        sourceId: 'pip',
        name: e.name!.trim(),
        installedVersion,
        latestVersion,
        status: statusFor(
          latestVersion,
          Boolean(installedVersion) && Boolean(latestVersion) && installedVersion !== latestVersion
        )
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const pipPackages: Source = {
  id: 'pip',
  label: 'Python Packages',
  itemNoun: 'packages',
  description: 'Python packages installed with pip.',
  toolId: 'pip',
  hint: 'Install Python from python.org',
  detect: detectViaTool('pip'),

  fetch: async (ctx) => {
    const pip = await requireTool('pip', ctx.settings);
    ctx.note('checking PyPI');
    const stdout = await execTool(pip, ['list', '--outdated', '--format=json'], {
      maxBuffer: 16 * 1024 * 1024,
      env: childEnv({ NO_COLOR: '1', PIP_DISABLE_PIP_VERSION_CHECK: '1' })
    });

    const trimmed = stdout.trim();
    if (!trimmed) return [];
    return toPipPackages(JSON.parse(trimmed) as PipOutdated);
  },

  // pip has no bulk upgrade, so name the packages explicitly.
  upgradeCommand: (outdated) =>
    outdated.length ? `pip install --upgrade ${outdated.map((p) => p.name).join(' ')}` : ''
};
