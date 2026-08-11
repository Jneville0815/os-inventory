import type { Package } from '../../shared/types';
import { childEnv } from '../childEnv';
import { execTool } from '../exec';
import { requireTool } from '../tools';
import { detectViaTool, type Source } from './source';

/**
 * `gem outdated` prints one line per stale gem:
 *
 *   CFPropertyList (2.3.6 < 4.0.0)
 *
 * Warnings about gems whose native extensions aren't built go to stderr, which
 * we don't read — so stdout is only these lines. Current gems aren't listed at
 * all, which is why every row here is outdated by construction.
 */
const LINE = /^(?<name>\S+)\s+\((?<installed>[^\s<]+)\s*<\s*(?<latest>[^)]+)\)/;

export function parseGemOutdated(stdout: string): Package[] {
  const packages: Package[] = [];
  const seen = new Set<string>();

  for (const line of stdout.split('\n')) {
    const m = LINE.exec(line.trim());
    if (!m?.groups) continue;
    const name = m.groups.name;
    if (seen.has(name)) continue;
    seen.add(name);
    packages.push({
      sourceId: 'gem',
      name,
      installedVersion: m.groups.installed.trim(),
      latestVersion: m.groups.latest.trim(),
      status: 'outdated'
    });
  }

  return packages.sort((a, b) => a.name.localeCompare(b.name));
}

export const rubyGems: Source = {
  id: 'gem',
  label: 'Ruby Gems',
  itemNoun: 'gems',
  description: 'Ruby gems installed with `gem install`.',
  platforms: ['darwin', 'linux', 'win32'],
  toolId: 'gem',
  hint: 'Install Ruby from ruby-lang.org',
  detect: detectViaTool('gem'),

  fetch: async (ctx) => {
    const gem = await requireTool('gem', ctx.settings);
    ctx.note('checking RubyGems');
    const stdout = await execTool(gem, ['outdated'], {
      maxBuffer: 16 * 1024 * 1024,
      env: childEnv({ NO_COLOR: '1' })
    });
    return parseGemOutdated(stdout);
  },

  upgradeCommand: (outdated) => (outdated.length ? 'gem update' : '')
};
