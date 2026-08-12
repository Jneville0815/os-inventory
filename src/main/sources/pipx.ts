import type { Package } from '../../shared/types';
import { childEnv } from '../childEnv';
import { execTool } from '../exec';
import { pypiLatest } from '../registry';
import { requireTool } from '../tools';
import { detectViaTool, statusFor, type Source } from './source';

/**
 * `pipx list --json` nests each tool under its venv name:
 *
 *   { "venvs": { "ruff": { "metadata": { "main_package": {
 *       "package": "ruff", "package_version": "0.5.0" } } } } }
 *
 * The venv key and the package name usually match but aren't guaranteed to, so
 * read the package name from the metadata.
 */
type PipxList = {
  pipx_spec_version?: string;
  venvs?: Record<
    string,
    { metadata?: { main_package?: { package?: string; package_version?: string } } }
  >;
};

export function parsePipxList(json: PipxList): Array<{ name: string; version: string }> {
  const tools: Array<{ name: string; version: string }> = [];

  for (const venv of Object.values(json.venvs ?? {})) {
    const main = venv?.metadata?.main_package;
    const name = main?.package?.trim();
    if (!name) continue;
    tools.push({ name, version: main?.package_version?.trim() ?? '' });
  }
  return tools;
}

export const pipxTools: Source = {
  id: 'pipx',
  label: 'pipx Tools',
  itemNoun: 'tools',
  description: 'Python command-line tools installed with `pipx install`.',
  toolId: 'pipx',
  hint: 'Install pipx from pipx.pypa.io',
  detect: detectViaTool('pipx'),

  fetch: async (ctx) => {
    const pipx = await requireTool('pipx', ctx.settings);
    const stdout = await execTool(pipx, ['list', '--json'], {
      maxBuffer: 16 * 1024 * 1024,
      env: childEnv({ NO_COLOR: '1' })
    });

    const trimmed = stdout.trim();
    // With nothing installed pipx prints a friendly message to stderr and no JSON.
    if (!trimmed) return [];

    const installed = parsePipxList(JSON.parse(trimmed) as PipxList);
    if (installed.length === 0) return [];

    ctx.note('checking PyPI');
    const latest = await pypiLatest(installed.map((t) => t.name));

    return installed
      .map<Package>((t) => {
        const latestVersion = latest.get(t.name) ?? t.version;
        return {
          sourceId: 'pipx',
          name: t.name,
          installedVersion: t.version,
          latestVersion,
          status: statusFor(latestVersion, Boolean(t.version) && t.version !== latestVersion)
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  upgradeCommand: (outdated) => (outdated.length ? 'pipx upgrade-all' : '')
};
