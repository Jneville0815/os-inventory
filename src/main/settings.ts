import { app } from 'electron';
import { join } from 'node:path';
import { readJsonFile, writeJsonAtomic } from './jsonStore';
import { isBuiltInSourceId } from './sources';
import type {
  CustomSource,
  CustomSourceMode,
  CustomSourceId,
  Settings,
  SourceId,
  ToolId
} from '../shared/types';

const FILENAME = 'settings.json';
const TOOL_IDS: ToolId[] = ['brew', 'npm', 'code', 'go'];
const MODES: CustomSourceMode[] = ['regex', 'tsv', 'json'];

const MAX_AUTO_REFRESH_MINUTES = 24 * 60;
const CUSTOM_ID = /^custom:[a-z0-9][a-z0-9-]*$/;

/** Nothing is tracked until the user adds it in Settings. */
export const DEFAULT_SETTINGS: Settings = {
  schema: 1,
  sources: [],
  customSources: [],
  toolPaths: {},
  autoRefreshMinutes: 60
};

function settingsPath(): string {
  return join(app.getPath('userData'), FILENAME);
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Validates one user-defined source, returning null if it's unusable.
 *
 * Note this is a *validity* check, not a safety boundary: a custom source runs
 * whatever command it names. That's inherent to the feature and fine for
 * something the user typed themselves — they can already run anything as
 * themselves. It stops being fine if custom sources ever become importable
 * from a URL or a shared file, which would turn this into a malware vector.
 * Keep them locally authored, or gate any import behind an explicit,
 * command-revealing confirmation.
 */
export function normalizeCustomSource(input: unknown): CustomSource | null {
  const raw = (input ?? {}) as Partial<CustomSource>;

  const id = cleanString(raw.id);
  if (!CUSTOM_ID.test(id)) return null;

  const label = cleanString(raw.label);
  const command = cleanString(raw.command);
  if (!label || !command) return null;

  const mode: CustomSourceMode = MODES.includes(raw.mode as CustomSourceMode)
    ? (raw.mode as CustomSourceMode)
    : 'tsv';

  const pattern = cleanString(raw.pattern);
  if (mode === 'regex') {
    if (!pattern) return null;
    // A pattern that won't compile would throw on every refresh.
    try {
      new RegExp(pattern);
    } catch {
      return null;
    }
  }

  const args = Array.isArray(raw.args)
    ? raw.args.filter((a): a is string => typeof a === 'string')
    : [];

  const allowExitCodes = Array.isArray(raw.allowExitCodes)
    ? raw.allowExitCodes.filter((c): c is number => Number.isInteger(c))
    : undefined;

  return {
    id: id as CustomSourceId,
    label,
    itemNoun: cleanString(raw.itemNoun) || 'items',
    command,
    args,
    mode,
    ...(mode === 'regex' ? { pattern } : {}),
    ...(cleanString(raw.upgradeCommand) ? { upgradeCommand: cleanString(raw.upgradeCommand) } : {}),
    ...(allowExitCodes?.length ? { allowExitCodes } : {})
  };
}

/**
 * Coerces anything read off disk (or sent over IPC) into valid Settings.
 * Unknown source ids, unknown tool ids and unusable custom sources are dropped
 * so a file written by a newer version, or hand-edited, can't break the app.
 */
export function normalizeSettings(input: unknown): Settings {
  const raw = (input ?? {}) as Partial<Settings>;

  const customSources: CustomSource[] = [];
  const customIds = new Set<string>();
  for (const entry of Array.isArray(raw.customSources) ? raw.customSources : []) {
    const source = normalizeCustomSource(entry);
    if (!source || customIds.has(source.id)) continue;
    customIds.add(source.id);
    customSources.push(source);
  }

  // A tracked id must name either a built-in or a custom source that survived
  // validation — otherwise it would be a tab with nothing behind it.
  const seen = new Set<SourceId>();
  const sources = (Array.isArray(raw.sources) ? raw.sources : []).filter((id) => {
    if (seen.has(id) || !(isBuiltInSourceId(id) || customIds.has(id))) return false;
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

  return { schema: 1, sources, customSources, toolPaths, autoRefreshMinutes };
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
