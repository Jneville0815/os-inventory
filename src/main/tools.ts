import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, constants } from 'node:fs/promises';
import type { Settings, ToolId } from '../shared/types';
import { childEnv } from './childEnv';

const execFileAsync = promisify(execFile);

/**
 * GUI apps launched from Finder/Dock don't inherit the shell's PATH (see
 * childEnv.ts), so a bare `execFile('brew', …)` fails in a packaged build. We
 * probe well-known absolute locations first and only fall back to a PATH lookup.
 * A user override in Settings beats both.
 */
const CANDIDATES: Record<ToolId, Partial<Record<NodeJS.Platform, string[]>>> = {
  brew: {
    darwin: ['/opt/homebrew/bin/brew', '/usr/local/bin/brew'],
    linux: ['/home/linuxbrew/.linuxbrew/bin/brew', '/usr/local/bin/brew']
  },
  npm: {
    darwin: ['/opt/homebrew/bin/npm', '/usr/local/bin/npm'],
    linux: ['/usr/local/bin/npm', '/usr/bin/npm'],
    win32: ['C:\\Program Files\\nodejs\\npm.cmd']
  },
  code: {
    darwin: [
      '/usr/local/bin/code',
      '/opt/homebrew/bin/code',
      '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code'
    ],
    linux: ['/usr/bin/code', '/usr/local/bin/code', '/snap/bin/code'],
    win32: ['C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd']
  },
  go: {
    darwin: ['/opt/homebrew/bin/go', '/usr/local/go/bin/go', '/usr/local/bin/go'],
    linux: ['/usr/local/go/bin/go', '/usr/bin/go'],
    win32: ['C:\\Program Files\\Go\\bin\\go.exe']
  }
};

const PATH_LOOKUP_CMD = process.platform === 'win32' ? 'where' : 'which';

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// Windows can only execute these; `where npm` lists the extensionless shell
// script first, which would fail to spawn.
const WINDOWS_EXECUTABLE = /\.(exe|cmd|bat|com)$/i;

async function lookupOnPath(name: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(PATH_LOOKUP_CMD, [name], {
      env: childEnv(),
      maxBuffer: 64 * 1024
    });
    const hits = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (process.platform === 'win32') {
      return hits.find((h) => WINDOWS_EXECUTABLE.test(h)) ?? hits[0] ?? null;
    }
    return hits[0] ?? null;
  } catch {
    return null;
  }
}

async function locate(id: ToolId, override: string | undefined): Promise<string | null> {
  if (override) {
    // An override that doesn't resolve is an error worth surfacing, not something
    // to silently paper over by falling back to auto-detection.
    return (await isExecutable(override)) ? override : null;
  }
  for (const candidate of CANDIDATES[id][process.platform] ?? []) {
    if (await isExecutable(candidate)) return candidate;
  }
  return lookupOnPath(id);
}

// Resolution costs a few stat() calls and sometimes a `which` spawn. Cache it,
// keyed by the override so changing a path in Settings re-detects immediately.
let cache = new Map<string, string | null>();

export function resetToolCache(): void {
  cache = new Map();
}

export async function resolveTool(id: ToolId, settings: Settings): Promise<string | null> {
  const override = settings.toolPaths[id]?.trim() || undefined;
  const key = `${id}:${override ?? ''}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const found = await locate(id, override);
  cache.set(key, found);
  return found;
}

/**
 * Resolves an arbitrary command for a custom source: an absolute or relative
 * path is used as given, a bare name goes through the PATH lookup. Not cached —
 * custom commands are edited and re-tested interactively.
 */
export async function resolveCommand(command: string): Promise<string | null> {
  const trimmed = command.trim();
  if (!trimmed) return null;
  if (trimmed.includes('/') || trimmed.includes('\\')) {
    return (await isExecutable(trimmed)) ? trimmed : null;
  }
  return lookupOnPath(trimmed);
}

/** Resolve or throw with a message worth showing in the UI. */
export async function requireTool(id: ToolId, settings: Settings): Promise<string> {
  const path = await resolveTool(id, settings);
  if (path) return path;
  const override = settings.toolPaths[id]?.trim();
  throw new Error(
    override
      ? `${id} not found at ${override} (set in Settings → Tool locations)`
      : `${id} was not found on this machine — install it, or set its path in Settings → Tool locations`
  );
}
