import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Package } from '../../shared/types';
import { childEnv } from '../childEnv';
import { requireTool } from '../tools';
import {
  detectViaTool,
  once,
  statusFor,
  type RefreshCtx,
  type Source
} from './source';

const execFileAsync = promisify(execFile);

const execOpts = {
  maxBuffer: 64 * 1024 * 1024,
  env: childEnv({
    // We control update timing explicitly via `brew update` below; without this,
    // `brew info` would kick off its own surprise updates.
    HOMEBREW_NO_AUTO_UPDATE: '1',
    HOMEBREW_NO_ENV_HINTS: '1',
    HOMEBREW_NO_ANALYTICS: '1'
  })
};

type BrewInfoPayload = {
  formulae: Array<{
    name: string;
    desc?: string;
    versions: { stable: string | null };
    installed: Array<{ version: string }>;
    outdated: boolean;
    pinned: boolean;
  }>;
  casks: Array<{
    token: string;
    name?: string[];
    desc?: string;
    version: string | null;
    installed: string | null;
    outdated: boolean;
    auto_updates: boolean | null;
    artifacts?: Array<Record<string, unknown>>;
  }>;
};

export type BrewInfo = {
  formulae: Package[];
  casks: Package[];
  /** Basenames of .app bundles owned by casks, e.g. "Rectangle.app". */
  caskAppNames: Set<string>;
};

export function collectCaskAppNames(casks: BrewInfoPayload['casks']): Set<string> {
  const names = new Set<string>();
  for (const c of casks) {
    for (const art of c.artifacts ?? []) {
      const appEntry = art['app'];
      if (!Array.isArray(appEntry)) continue;
      for (const item of appEntry) {
        if (typeof item === 'string' && item.endsWith('.app')) {
          names.add(item);
        }
      }
    }
  }
  return names;
}

export function toFormulaPackages(formulae: BrewInfoPayload['formulae']): Package[] {
  return formulae
    .map<Package>((f) => ({
      sourceId: 'homebrew-formula',
      name: f.name,
      description: f.desc,
      installedVersion: f.installed[0]?.version ?? '',
      latestVersion: f.versions.stable ?? '',
      // A pinned formula that's also outdated leads with "outdated" — the
      // actionable fact — and keeps the pin as a badge explaining why it's stuck.
      status: f.pinned && !f.outdated ? 'held' : statusFor(f.versions.stable ?? '', f.outdated),
      badges:
        f.pinned && f.outdated
          ? [{ label: 'pinned', tone: 'muted', title: 'Held by `brew pin`' }]
          : undefined
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function toCaskPackages(casks: BrewInfoPayload['casks']): Package[] {
  return casks
    .map<Package>((c) => ({
      sourceId: 'homebrew-cask',
      name: c.token,
      displayName: c.name?.[0],
      description: c.desc,
      installedVersion: c.installed ?? '',
      latestVersion: c.version ?? '',
      status: statusFor(c.version ?? '', c.outdated),
      badges: c.auto_updates
        ? [
            {
              label: 'self-updates',
              tone: 'info',
              title: "App updates itself — brew's version tracking may lag"
            }
          ]
        : undefined
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function loadBrewInfo(ctx: RefreshCtx): Promise<BrewInfo> {
  const brew = await requireTool('brew', ctx.settings);
  const run = async (args: string[]): Promise<string> =>
    (await execFileAsync(brew, args, execOpts)).stdout;

  // Refreshes the local tap clones so `versions.stable` is genuinely current.
  // Slow (10–30s cold) but it's the whole basis of the "latest version" claim.
  ctx.note('updating taps');
  await run(['update', '--quiet']);

  ctx.note('reading installed packages');
  const parsed = JSON.parse(await run(['info', '--json=v2', '--installed'])) as BrewInfoPayload;

  return {
    formulae: toFormulaPackages(parsed.formulae),
    casks: toCaskPackages(parsed.casks),
    caskAppNames: collectCaskAppNames(parsed.casks)
  };
}

/**
 * One `brew update` + `brew info` per refresh, however many brew-backed sources
 * are enabled and whatever order they run in.
 */
export function sharedBrewInfo(ctx: RefreshCtx): Promise<BrewInfo> {
  return once(ctx, 'brew:info', () => loadBrewInfo(ctx));
}

const HINT = 'Install Homebrew from brew.sh';

export const homebrewFormula: Source = {
  id: 'homebrew-formula',
  label: 'Brew Formulae',
  itemNoun: 'formulae',
  description: 'Command-line packages installed with `brew install`.',
  platforms: ['darwin', 'linux'],
  toolId: 'brew',
  hint: HINT,
  detect: detectViaTool('brew'),
  fetch: async (ctx) => (await sharedBrewInfo(ctx)).formulae,
  upgradeCommand: (outdated) => (outdated.length ? 'brew upgrade --formula' : '')
};

export const homebrewCask: Source = {
  id: 'homebrew-cask',
  label: 'Brew Casks',
  itemNoun: 'casks',
  description: 'GUI applications installed with `brew install --cask`.',
  platforms: ['darwin'],
  toolId: 'brew',
  hint: HINT,
  detect: detectViaTool('brew'),
  fetch: async (ctx) => (await sharedBrewInfo(ctx)).casks,
  upgradeCommand: (outdated) => (outdated.length ? 'brew upgrade --cask' : '')
};
