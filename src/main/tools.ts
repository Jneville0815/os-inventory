import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, constants } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Settings, ToolId } from '../shared/types';
import { childEnv } from './childEnv';

const execFileAsync = promisify(execFile);

/**
 * Where each CLI usually lives on macOS. Probed in order, before falling back to
 * a PATH lookup; a user override in Settings beats both.
 *
 * GUI apps launched from Finder/Dock don't inherit the shell's PATH (see
 * childEnv.ts), so a bare `execFile('brew', …)` fails in a packaged build —
 * which is why absolute paths are tried first at all.
 *
 * `/opt/homebrew` is Apple Silicon, `/usr/local` is Intel. Both are listed so
 * one build covers either Mac.
 */
const CANDIDATES: Record<ToolId, string[]> = {
  brew: ['/opt/homebrew/bin/brew', '/usr/local/bin/brew'],
  npm: ['/opt/homebrew/bin/npm', '/usr/local/bin/npm'],
  pnpm: ['/opt/homebrew/bin/pnpm', '/usr/local/bin/pnpm'],
  yarn: ['/opt/homebrew/bin/yarn', '/usr/local/bin/yarn'],
  bun: [join(homedir(), '.bun', 'bin', 'bun'), '/opt/homebrew/bin/bun'],
  pip: ['/opt/homebrew/bin/pip3', '/usr/local/bin/pip3', '/usr/bin/pip3'],
  pipx: ['/opt/homebrew/bin/pipx', join(homedir(), '.local', 'bin', 'pipx')],
  uv: [join(homedir(), '.local', 'bin', 'uv'), '/opt/homebrew/bin/uv'],
  // macOS ships a system Ruby; a Homebrew or rbenv Ruby shadows it via PATH.
  gem: ['/opt/homebrew/bin/gem', '/usr/local/bin/gem', '/usr/bin/gem'],
  // rustup puts a shim in ~/.cargo/bin.
  cargo: [join(homedir(), '.cargo', 'bin', 'cargo')],
  composer: ['/opt/homebrew/bin/composer', '/usr/local/bin/composer'],
  go: ['/opt/homebrew/bin/go', '/usr/local/go/bin/go', '/usr/local/bin/go']
};

/**
 * What to look for on PATH. Usually the tool id, but not always: `pip` is
 * `pip3` nearly everywhere, and a bare `pip` often doesn't exist at all.
 */
const LOOKUP_NAMES: Record<ToolId, string[]> = {
  brew: ['brew'],
  npm: ['npm'],
  pnpm: ['pnpm'],
  yarn: ['yarn'],
  bun: ['bun'],
  pip: ['pip3', 'pip'],
  pipx: ['pipx'],
  uv: ['uv'],
  gem: ['gem'],
  cargo: ['cargo'],
  composer: ['composer'],
  go: ['go']
};

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function lookupOnPath(name: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('which', [name], {
      env: childEnv(),
      maxBuffer: 64 * 1024
    });
    return stdout.split('\n')[0]?.trim() || null;
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
  for (const candidate of CANDIDATES[id]) {
    if (await isExecutable(candidate)) return candidate;
  }
  for (const name of LOOKUP_NAMES[id]) {
    const found = await lookupOnPath(name);
    if (found) return found;
  }
  return null;
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
 * Resolves an arbitrary command for a custom source: a path is used as given, a
 * bare name goes through the PATH lookup. Not cached — custom commands are
 * edited and re-tested interactively.
 */
export async function resolveCommand(command: string): Promise<string | null> {
  const trimmed = command.trim();
  if (!trimmed) return null;
  if (trimmed.includes('/')) {
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
