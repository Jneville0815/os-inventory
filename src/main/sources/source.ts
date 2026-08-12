import type { Package, PackageStatus, Settings, SourceId, ToolId } from '../../shared/types';
import { resolveTool } from '../tools';

/** Per-refresh context handed to every source. */
export type RefreshCtx = {
  settings: Settings;
  /**
   * Memoises work shared between sources within a single refresh — notably the
   * one `brew info` call that the formula, cask and desktop-app sources all read.
   */
  shared: Map<string, Promise<unknown>>;
  /** Report a sub-step, e.g. "updating taps". */
  note: (text: string) => void;
};

export type DetectResult = { detected: boolean; toolPath?: string };

/**
 * A package ecosystem. Adding one means writing a module like this and appending
 * it to SOURCES in ./index.ts — nothing in main/index.ts or the renderer names a
 * specific ecosystem.
 */
export type Source = {
  id: SourceId;
  /** Tab and settings-row label. */
  label: string;
  /** Plural noun for the filter placeholder, e.g. "formulae". */
  itemNoun: string;
  /** One line explaining what this tracks, shown in Settings. */
  description: string;
  /** The CLI it shells out to, if any. */
  toolId?: ToolId;
  /** Shown when the tool is missing. */
  hint?: string;
  /** True for user-defined sources — the settings UI offers Edit/Delete for these. */
  isCustom?: boolean;
  detect: (settings: Settings) => Promise<DetectResult>;
  fetch: (ctx: RefreshCtx) => Promise<Package[]>;
  /**
   * Command that upgrades everything outdated. Return null when the ecosystem
   * has no such command; return '' when there's nothing to upgrade right now.
   */
  upgradeCommand?: (outdated: Package[]) => string | null;
};

/** Detection for the common case: the source works iff its CLI resolves. */
export function detectViaTool(toolId: ToolId) {
  return async (settings: Settings): Promise<DetectResult> => {
    const toolPath = await resolveTool(toolId, settings);
    return { detected: toolPath !== null, toolPath: toolPath ?? undefined };
  };
}

/**
 * Shared status rule: an item with no known latest version reads as `unknown`
 * rather than `current` — we can't claim something is up to date with no feed.
 */
export function statusFor(latestVersion: string, outdated: boolean): PackageStatus {
  if (outdated) return 'outdated';
  if (!latestVersion) return 'unknown';
  return 'current';
}

export function sortByDisplayName(a: Package, b: Package): number {
  return (a.displayName ?? a.name).localeCompare(b.displayName ?? b.name);
}

/** Memoise a promise on the shared per-refresh map. */
export function once<T>(ctx: RefreshCtx, key: string, make: () => Promise<T>): Promise<T> {
  const existing = ctx.shared.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const created = make();
  ctx.shared.set(key, created);
  return created;
}
