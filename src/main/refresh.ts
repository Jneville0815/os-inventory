import type { Package, RefreshProgress, Settings, Snapshot, SourceResult } from '../shared/types';
import { resolveSources, type RefreshCtx, type Source } from './sources';
import { resetToolCache } from './tools';

function errorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.trim() || 'Refresh failed';
}

async function runSource(
  source: Source,
  ctx: Omit<RefreshCtx, 'note'>,
  report: (patch: Partial<RefreshProgress>) => void
): Promise<SourceResult> {
  const refreshedAt = new Date().toISOString();
  report({ state: 'running' });

  try {
    const items = await source.fetch({
      ...ctx,
      note: (note) => report({ state: 'running', note })
    });
    const outdated = items.filter((p: Package) => p.status === 'outdated');
    const command = source.upgradeCommand?.(outdated);

    report({ state: 'done' });
    return {
      id: source.id,
      refreshedAt,
      state: 'ok',
      items,
      ...(typeof command === 'string' ? { upgradeCommand: command } : {})
    };
  } catch (err) {
    console.error(`[refresh] ${source.id} failed:`, err);
    report({ state: 'error' });
    return { id: source.id, refreshedAt, state: 'error', error: errorMessage(err), items: [] };
  }
}

/**
 * Refreshes every tracked source concurrently. Each source is isolated: a
 * missing CLI or dead network marks that one source as errored and leaves the
 * rest intact, rather than failing the whole refresh.
 *
 * The returned snapshot contains exactly the tracked sources — untracking one
 * drops its data rather than leaving stale rows behind.
 */
export async function runRefresh(
  settings: Settings,
  emit: (progress: RefreshProgress) => void
): Promise<Snapshot> {
  resetToolCache();

  const available = new Map(resolveSources(settings).map((s) => [s.id, s] as const));
  const tracked = settings.sources
    .map((id) => available.get(id))
    .filter((s): s is Source => s !== undefined);

  // Shared across sources so the brew-backed ones trigger one `brew info` between them.
  const ctx = { settings, shared: new Map<string, Promise<unknown>>() };

  const total = tracked.length;
  let completed = 0;

  const results = await Promise.all(
    tracked.map((source) =>
      runSource(source, ctx, (patch) => {
        if (patch.state === 'done' || patch.state === 'error') completed += 1;
        emit({
          sourceId: source.id,
          label: source.label,
          state: 'running',
          completed,
          total,
          ...patch
        });
      })
    )
  );

  return {
    schema: 2,
    refreshedAt: new Date().toISOString(),
    sources: Object.fromEntries(results.map((r) => [r.id, r]))
  };
}
