import type { Package } from '../../shared/types';
import { childEnv } from '../childEnv';
import { execTool } from '../exec';
import { npmLatest } from '../registry';
import { requireTool } from '../tools';
import { detectViaTool, statusFor, type Source } from './source';

/**
 * Parses `yarn global list`, which prints one info line per package:
 *
 *   yarn global v1.22.22
 *   info "cowsay@1.4.0" has binaries:
 *      - cowsay
 *   Done in 0.05s.
 *
 * Scoped names keep their leading @, so split on the *last* @ to find the version.
 */
export function parseYarnGlobalList(stdout: string): Array<{ name: string; version: string }> {
  const line = /^info\s+"(?<spec>[^"]+)"\s+has binaries/;
  const packages: Array<{ name: string; version: string }> = [];

  for (const raw of stdout.split('\n')) {
    const m = line.exec(raw.trim());
    if (!m?.groups) continue;
    const spec = m.groups.spec;
    const at = spec.lastIndexOf('@');
    if (at <= 0) continue;
    packages.push({ name: spec.slice(0, at), version: spec.slice(at + 1) });
  }
  return packages;
}

export const yarnGlobals: Source = {
  id: 'yarn-global',
  label: 'Yarn Globals',
  itemNoun: 'packages',
  description: 'Packages installed with `yarn global add` (Yarn 1 only).',
  platforms: ['darwin', 'linux', 'win32'],
  toolId: 'yarn',
  hint: 'Install Yarn from yarnpkg.com',
  detect: detectViaTool('yarn'),

  fetch: async (ctx) => {
    const yarn = await requireTool('yarn', ctx.settings);
    const opts = { maxBuffer: 16 * 1024 * 1024, env: childEnv({ NO_COLOR: '1' }) };

    // Yarn 2+ removed global installs outright, so `yarn global list` there is a
    // usage error. Say that plainly rather than surfacing yarn's own message.
    const version = (await execTool(yarn, ['--version'], opts)).trim();
    if (!version.startsWith('1.')) {
      throw new Error(
        `Yarn ${version} has no global installs — Yarn 2+ removed them. Use npm or pnpm globals instead.`
      );
    }

    const installed = parseYarnGlobalList(await execTool(yarn, ['global', 'list'], opts));
    if (installed.length === 0) return [];

    ctx.note('checking npm registry');
    const latest = await npmLatest(installed.map((p) => p.name));

    return installed
      .map<Package>((p) => {
        const latestVersion = latest.get(p.name) ?? p.version;
        return {
          sourceId: 'yarn-global',
          name: p.name,
          installedVersion: p.version,
          latestVersion,
          status: statusFor(latestVersion, p.version !== latestVersion)
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  upgradeCommand: (outdated) =>
    outdated.length ? `yarn global upgrade ${outdated.map((p) => p.name).join(' ')}` : ''
};
