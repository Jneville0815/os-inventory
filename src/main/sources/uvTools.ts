import type { Package } from '../../shared/types';
import { childEnv } from '../childEnv';
import { execTool } from '../exec';
import { pypiLatest } from '../registry';
import { requireTool } from '../tools';
import { detectViaTool, statusFor, type Source } from './source';

type InstalledTool = { name: string; version: string };

/**
 * Parses `uv tool list`:
 *
 *   cowsay v5.0
 *   - cowsay
 *   ruff v0.5.0
 *   - ruff
 *
 * Note the binary lines start with "- " rather than being indented, so the
 * header test is a positive match rather than "not indented".
 */
export function parseUvToolList(stdout: string): InstalledTool[] {
  const header = /^(?<name>\S+)\s+v(?<version>\S+)$/;
  const tools: InstalledTool[] = [];

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('-')) continue;
    const m = header.exec(trimmed);
    if (m?.groups) tools.push({ name: m.groups.name, version: m.groups.version });
  }
  return tools;
}

export const uvTools: Source = {
  id: 'uv-tool',
  label: 'uv Tools',
  itemNoun: 'tools',
  description: 'Python command-line tools installed with `uv tool install`.',
  platforms: ['darwin', 'linux', 'win32'],
  toolId: 'uv',
  hint: 'Install uv from astral.sh/uv',
  detect: detectViaTool('uv'),

  fetch: async (ctx) => {
    const uv = await requireTool('uv', ctx.settings);
    const stdout = await execTool(uv, ['tool', 'list'], {
      maxBuffer: 8 * 1024 * 1024,
      env: childEnv({ NO_COLOR: '1' })
    });

    const installed = parseUvToolList(stdout);
    if (installed.length === 0) return [];

    ctx.note('checking PyPI');
    const latest = await pypiLatest(installed.map((t) => t.name));

    return installed
      .map<Package>((t) => {
        const latestVersion = latest.get(t.name) ?? t.version;
        return {
          sourceId: 'uv-tool',
          name: t.name,
          installedVersion: t.version,
          latestVersion,
          status: statusFor(latestVersion, t.version !== latestVersion)
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  upgradeCommand: (outdated) => (outdated.length ? 'uv tool upgrade --all' : '')
};
