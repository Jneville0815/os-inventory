import type { Package } from '../../shared/types';
import { childEnv } from '../childEnv';
import { execToolAllowExit } from '../exec';
import { requireTool } from '../tools';
import { detectViaTool, statusFor, type Source } from './source';

/**
 * `composer global outdated --format=json` reports installed and latest together,
 * nested under `installed`:
 *
 *   { "installed": [ { "name": "psr/log", "version": "1.1.0", "latest": "3.0.2" } ] }
 */
type ComposerOutdated = {
  installed?: Array<{ name?: string; version?: string; latest?: string; description?: string }>;
};

export function toComposerPackages(json: ComposerOutdated): Package[] {
  return (json.installed ?? [])
    .filter((e) => typeof e.name === 'string' && e.name.trim())
    .map<Package>((e) => {
      const installedVersion = e.version?.trim() ?? '';
      const latestVersion = e.latest?.trim() ?? '';
      return {
        sourceId: 'composer',
        name: e.name!.trim(),
        description: e.description,
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

export const composerGlobals: Source = {
  id: 'composer',
  label: 'Composer Globals',
  itemNoun: 'packages',
  description: 'PHP packages installed with `composer global require`.',
  platforms: ['darwin', 'linux', 'win32'],
  toolId: 'composer',
  hint: 'Install Composer from getcomposer.org',
  detect: detectViaTool('composer'),

  fetch: async (ctx) => {
    const composer = await requireTool('composer', ctx.settings);
    // Exit 1 with nothing on stdout is what composer does when there's no global
    // composer.json at all — i.e. the user has composer but no global packages.
    // That's an empty tab, not an error.
    const stdout = await execToolAllowExit(
      composer,
      ['global', 'outdated', '--format=json', '--no-interaction'],
      { maxBuffer: 16 * 1024 * 1024, env: childEnv({ NO_COLOR: '1' }) },
      [1]
    );

    const trimmed = stdout.trim();
    if (!trimmed) return [];
    return toComposerPackages(JSON.parse(trimmed) as ComposerOutdated);
  },

  upgradeCommand: (outdated) => (outdated.length ? 'composer global update' : '')
};
