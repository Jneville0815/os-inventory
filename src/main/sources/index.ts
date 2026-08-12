import type { BuiltInSourceId, Settings, SourceDescriptor, SourceId } from '../../shared/types';
import { resetToolCache } from '../tools';
import { homebrewFormula } from './homebrew';
import { npmGlobals } from './npmGlobals';
import { pipPackages } from './pip';
import { rubyGems } from './gem';
import { cargoInstall } from './cargo';
import { pipxTools } from './pipx';
import { uvTools } from './uvTools';
import { pnpmGlobals } from './pnpmGlobals';
import { yarnGlobals } from './yarnGlobals';
import { bunGlobals } from './bunGlobals';
import { composerGlobals } from './composer';
import { goInstall } from './goInstall';
import { makeCustomSource } from './custom';
import type { Source } from './source';

export type { RefreshCtx, Source } from './source';
export { testCustomSource } from './custom';

/**
 * The package managers shipped with the app, in the order they're offered.
 *
 * Scope rule: **package managers that install developer dependencies.** Not
 * applications, not their plugins, not OS software. Keeping to one category is
 * what stops this reading as somebody's personal setup — and it makes "should
 * we add X?" answerable without a judgment call.
 *
 * Anything outside that, the user adds as a custom source.
 */
export const BUILT_IN: Source[] = [
  homebrewFormula,
  npmGlobals,
  pnpmGlobals,
  yarnGlobals,
  bunGlobals,
  pipPackages,
  pipxTools,
  uvTools,
  rubyGems,
  cargoInstall,
  composerGlobals,
  goInstall
];

const BUILT_IN_IDS = new Set<string>(BUILT_IN.map((s) => s.id));

export function isBuiltInSourceId(id: unknown): id is BuiltInSourceId {
  return typeof id === 'string' && BUILT_IN_IDS.has(id);
}

/** Built-ins plus the user's custom sources. */
export function resolveSources(settings: Settings): Source[] {
  return [...BUILT_IN, ...settings.customSources.map(makeCustomSource)];
}

export function findSource(settings: Settings, id: SourceId): Source | undefined {
  return resolveSources(settings).find((s) => s.id === id);
}

/**
 * Describes every source for the settings panel, including whether its CLI is
 * actually present. Detection is re-run on each call so a tool installed (or a
 * path corrected) while the app is open shows up without a restart.
 */
export async function describeSources(settings: Settings): Promise<SourceDescriptor[]> {
  resetToolCache();

  return Promise.all(
    resolveSources(settings).map(async (source): Promise<SourceDescriptor> => {
      const { detected, toolPath } = await source.detect(settings);

      return {
        id: source.id,
        label: source.label,
        itemNoun: source.itemNoun,
        description: source.description,
        toolId: source.toolId,
        isCustom: source.isCustom ?? false,
        detected,
        toolPath,
        hint: source.hint
      };
    })
  );
}
