import { app } from 'electron';
import { join } from 'node:path';
import { readJsonFile, writeJsonAtomic } from './jsonStore';
import { findSource } from './sources';
import type { Settings, SourceId, ToolId } from '../shared/types';

const FILENAME = 'settings.json';
const TOOL_IDS: ToolId[] = ['brew', 'npm', 'code', 'go'];

const MAX_AUTO_REFRESH_MINUTES = 24 * 60;

/** Nothing is tracked until the user adds it in Settings. */
export const DEFAULT_SETTINGS: Settings = {
  schema: 1,
  sources: [],
  toolPaths: {},
  autoRefreshMinutes: 60
};

function settingsPath(): string {
  return join(app.getPath('userData'), FILENAME);
}

/**
 * Coerces anything read off disk (or sent over IPC) into a valid Settings.
 * Unknown source ids and tool ids are dropped so a settings file written by a
 * newer version, or hand-edited, can't break the app.
 */
export function normalizeSettings(input: unknown): Settings {
  const raw = (input ?? {}) as Partial<Settings>;

  const seen = new Set<SourceId>();
  const sources = (Array.isArray(raw.sources) ? raw.sources : []).filter((id) => {
    if (seen.has(id) || !findSource(id)) return false;
    seen.add(id);
    return true;
  });

  const toolPaths: Partial<Record<ToolId, string>> = {};
  for (const id of TOOL_IDS) {
    const value = raw.toolPaths?.[id];
    if (typeof value === 'string' && value.trim()) toolPaths[id] = value.trim();
  }

  const minutes = Number(raw.autoRefreshMinutes);
  const autoRefreshMinutes = Number.isFinite(minutes)
    ? Math.min(Math.max(Math.round(minutes), 0), MAX_AUTO_REFRESH_MINUTES)
    : DEFAULT_SETTINGS.autoRefreshMinutes;

  return { schema: 1, sources, toolPaths, autoRefreshMinutes };
}

export async function readSettings(): Promise<Settings> {
  return normalizeSettings(await readJsonFile<Settings>(settingsPath()));
}

/** Returns the normalized settings that were actually written. */
export async function writeSettings(input: unknown): Promise<Settings> {
  const settings = normalizeSettings(input);
  await writeJsonAtomic(settingsPath(), settings);
  return settings;
}
