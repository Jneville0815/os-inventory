import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Package } from '../../shared/types';
import { childEnv } from '../childEnv';
import { requireTool } from '../tools';
import { detectViaTool, statusFor, type RefreshCtx, type Source } from './source';

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

// `--installed` also returns a `casks` array; we ask for formulae only, since
// casks install GUI applications rather than developer dependencies.
type BrewInfoPayload = {
  formulae: Array<{
    name: string;
    desc?: string;
    versions: { stable: string | null };
    installed: Array<{ version: string }>;
    outdated: boolean;
    pinned: boolean;
  }>;
};

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

async function loadFormulae(ctx: RefreshCtx): Promise<Package[]> {
  const brew = await requireTool('brew', ctx.settings);
  const run = async (args: string[]): Promise<string> =>
    (await execFileAsync(brew, args, execOpts)).stdout;

  // Refreshes the local tap clones so `versions.stable` is genuinely current.
  // Slow (10–30s cold) but it's the whole basis of the "latest version" claim.
  ctx.note('updating taps');
  await run(['update', '--quiet']);

  ctx.note('reading installed packages');
  const parsed = JSON.parse(await run(['info', '--json=v2', '--installed'])) as BrewInfoPayload;

  return toFormulaPackages(parsed.formulae);
}

export const homebrewFormula: Source = {
  id: 'homebrew-formula',
  label: 'Homebrew',
  itemNoun: 'formulae',
  description: 'Command-line packages installed with `brew install`.',
  platforms: ['darwin', 'linux'],
  toolId: 'brew',
  hint: 'Install Homebrew from brew.sh',
  detect: detectViaTool('brew'),
  fetch: loadFormulae,
  upgradeCommand: (outdated) => (outdated.length ? 'brew upgrade --formula' : '')
};
