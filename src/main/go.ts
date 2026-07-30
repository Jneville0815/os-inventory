import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Package, RefreshProgress } from '../shared/types';
import { childEnv } from './childEnv';

const execFileAsync = promisify(execFile);

// See CLAUDE.md for why CLI paths are hard-coded.
const GO_PATH = '/opt/homebrew/bin/go';
const PROXY_URL = 'https://proxy.golang.org';

type BinaryInfo = {
  binary: string;      // filename, e.g. "staticcheck"
  installPath: string; // from `path` line, e.g. "honnef.co/go/tools/cmd/staticcheck"
  module: string;      // from `mod` line, e.g. "honnef.co/go/tools"
  version: string;     // from `mod` line, e.g. "v0.6.1"
};

async function resolveGoBin(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(GO_PATH, ['env', 'GOBIN', 'GOPATH'], {
      env: childEnv()
    });
    const [gobin, gopath] = stdout.split('\n');
    if (gobin?.trim()) return gobin.trim();
    if (gopath?.trim()) return join(gopath.trim(), 'bin');
    return join(homedir(), 'go', 'bin');
  } catch {
    return null;
  }
}

async function listInstalledBinaries(): Promise<BinaryInfo[]> {
  const gobin = await resolveGoBin();
  if (!gobin) return [];

  let entries: Dirent[];
  try {
    entries = await readdir(gobin, { withFileTypes: true });
  } catch {
    return [];
  }

  const paths = entries.filter((e) => e.isFile()).map((e) => join(gobin, e.name));
  if (paths.length === 0) return [];

  // `go version -m` accepts multiple binaries at once and is tolerant of
  // non-Go files (emits a "not a Go executable" notice which our parser skips).
  const { stdout } = await execFileAsync(GO_PATH, ['version', '-m', ...paths], {
    maxBuffer: 16 * 1024 * 1024,
    env: childEnv()
  });

  return parseVersionOutput(stdout);
}

function parseVersionOutput(stdout: string): BinaryInfo[] {
  const out: BinaryInfo[] = [];
  let current: Partial<BinaryInfo> | null = null;

  const flush = (): void => {
    if (current?.binary && current.installPath && current.module && current.version) {
      out.push(current as BinaryInfo);
    }
  };

  for (const line of stdout.split('\n')) {
    if (!line.startsWith('\t')) {
      flush();
      if (!line.trim()) {
        current = null;
        continue;
      }
      const colonIdx = line.lastIndexOf(':');
      if (colonIdx === -1) {
        current = null;
        continue;
      }
      const path = line.slice(0, colonIdx);
      current = { binary: path.split('/').pop() ?? path };
    } else if (current) {
      const parts = line.split('\t').filter(Boolean);
      if (parts[0] === 'path' && parts[1]) {
        current.installPath = parts[1];
      } else if (parts[0] === 'mod' && parts[1] && parts[2]) {
        current.module = parts[1];
        current.version = parts[2];
      }
    }
  }
  flush();
  return out;
}

// Go module proxy protocol requires uppercase letters be escaped as "!lower".
function escapeModulePath(mod: string): string {
  return mod.replace(/[A-Z]/g, (c) => '!' + c.toLowerCase());
}

async function queryLatest(module: string): Promise<string | null> {
  try {
    const res = await fetch(`${PROXY_URL}/${escapeModulePath(module)}/@latest`);
    if (!res.ok) return null;
    const data = (await res.json()) as { Version?: string };
    return data.Version ?? null;
  } catch {
    return null;
  }
}

export async function fetchGoBinaries(
  onProgress: (p: RefreshProgress) => void
): Promise<Package[]> {
  onProgress({ phase: 'querying-go' });

  let binaries: BinaryInfo[];
  try {
    binaries = await listInstalledBinaries();
  } catch (err) {
    console.error('[go] listing binaries failed:', err);
    return [];
  }
  if (binaries.length === 0) return [];

  const modules = Array.from(new Set(binaries.map((b) => b.module)));
  const latestByModule = new Map<string, string>();
  await Promise.all(
    modules.map(async (m) => {
      const latest = await queryLatest(m);
      if (latest) latestByModule.set(m, latest);
    })
  );

  return binaries
    .map<Package>((b) => {
      const latest = latestByModule.get(b.module) ?? b.version;
      return {
        kind: 'go-install',
        name: b.installPath,
        displayName: b.binary,
        installedVersion: b.version,
        latestVersion: latest,
        outdated: b.version !== latest
      };
    })
    .sort((a, b) => (a.displayName ?? a.name).localeCompare(b.displayName ?? b.name));
}
