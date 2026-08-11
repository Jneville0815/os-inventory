import type {
  BuiltInSourceId,
  Settings,
  SourceDescriptor,
  SourceId
} from '../../shared/types';
import { resetToolCache } from '../tools';
import { homebrewFormula, homebrewCask } from './homebrew';
import { npmGlobals } from './npmGlobals';
import { vscodeExtensions } from './vscodeExtensions';
import { goInstall } from './goInstall';
import { macosApps } from './macosApps';
import { makeCustomSource } from './custom';
import type { Source } from './source';

export type { RefreshCtx, Source } from './source';
export { testCustomSource } from './custom';

/**
 * Every ecosystem shipped with the app, in the order they're offered in
 * Settings. Adding one means writing a module here and appending it.
 */
export const BUILT_IN: Source[] = [
  homebrewFormula,
  homebrewCask,
  npmGlobals,
  vscodeExtensions,
  goInstall,
  macosApps
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

export function isSupported(source: Source): boolean {
  return source.platforms.includes(process.platform);
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
      const supported = isSupported(source);
      const { detected, toolPath } = supported
        ? await source.detect(settings)
        : { detected: false, toolPath: undefined };

      return {
        id: source.id,
        label: source.label,
        itemNoun: source.itemNoun,
        description: source.description,
        toolId: source.toolId,
        isCustom: source.isCustom ?? false,
        supported,
        detected,
        toolPath,
        hint: source.hint
      };
    })
  );
}
