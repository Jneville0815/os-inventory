import type { Settings, SourceDescriptor, SourceId } from '../../shared/types';
import { resetToolCache } from '../tools';
import { homebrewFormula, homebrewCask } from './homebrew';
import { npmGlobals } from './npmGlobals';
import { vscodeExtensions } from './vscodeExtensions';
import { goInstall } from './goInstall';
import { macosApps } from './macosApps';
import type { Source } from './source';

export type { RefreshCtx, Source } from './source';

/**
 * Every ecosystem the app knows about, in the order they're offered in Settings.
 * Adding one means writing a module in this directory and appending it here.
 */
export const SOURCES: Source[] = [
  homebrewFormula,
  homebrewCask,
  npmGlobals,
  vscodeExtensions,
  goInstall,
  macosApps
];

const BY_ID = new Map<SourceId, Source>(SOURCES.map((s) => [s.id, s]));

export function findSource(id: SourceId): Source | undefined {
  return BY_ID.get(id);
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
    SOURCES.map(async (source): Promise<SourceDescriptor> => {
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
        supported,
        detected,
        toolPath,
        hint: source.hint
      };
    })
  );
}
