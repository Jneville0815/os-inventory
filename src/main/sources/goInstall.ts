import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Package } from '../../shared/types';
import { childEnv } from '../childEnv';
import { requireTool } from '../tools';
import { detectViaTool, sortByDisplayName, statusFor, type Source } from './source';

const execFileAsync = promisify(execFile);

const PROXY_URL = 'https://proxy.golang.org';

type BinaryInfo = {
  binary: string; // filename, e.g. "staticcheck"
  installPath: string; // from `path` line, e.g. "honnef.co/go/tools/cmd/staticcheck"
  module: string; // from `mod` line, e.g. "honnef.co/go/tools"
  version: string; // from `mod` line, e.g. "v0.6.1"
};

async function resolveGoBin(go: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(go, ['env', 'GOBIN', 'GOPATH'], {
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

/**
 * Parses `go version -m` output: unindented header lines (`/path/to/bin: go1.24.0`)
 * followed by indented tab-separated fields. Non-Go files produce a header with
 * no `mod` line and are dropped.
 */
export function parseVersionOutput(stdout: string): BinaryInfo[] {
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

async function listInstalledBinaries(go: string): Promise<BinaryInfo[]> {
  const gobin = await resolveGoBin(go);
  if (!gobin) return [];

  let entries: Dirent[];
  try {
    entries = await readdir(gobin, { withFileTypes: true });
  } catch {
    return [];
  }

  const paths = entries.filter((e) => e.isFile()).map((e) => join(gobin, e.name));
  if (paths.length === 0) return [];

  // `go version -m` accepts multiple binaries at once and tolerates non-Go files.
  const { stdout } = await execFileAsync(go, ['version', '-m', ...paths], {
    maxBuffer: 16 * 1024 * 1024,
    env: childEnv()
  });

  return parseVersionOutput(stdout);
}

// The module proxy protocol requires uppercase letters be escaped as "!lower".
export function escapeModulePath(mod: string): string {
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

export const goInstall: Source = {
  id: 'go-install',
  label: 'Go Binaries',
  itemNoun: 'binaries',
  description: 'Binaries installed with `go install` into $GOBIN.',
  platforms: ['darwin', 'linux', 'win32'],
  toolId: 'go',
  hint: 'Install Go from go.dev',
  detect: detectViaTool('go'),

  fetch: async (ctx) => {
    const go = await requireTool('go', ctx.settings);
    const binaries = await listInstalledBinaries(go);
    if (binaries.length === 0) return [];

    ctx.note('querying module proxy');
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
        // Proxy miss → assume current rather than invent an update.
        const latest = latestByModule.get(b.module) ?? b.version;
        return {
          sourceId: 'go-install',
          name: b.installPath,
          displayName: b.binary,
          installedVersion: b.version,
          latestVersion: latest,
          status: statusFor(latest, b.version !== latest)
        };
      })
      .sort(sortByDisplayName);
  },

  upgradeCommand: (outdated) =>
    outdated.map((p) => `go install ${p.name}@latest`).join(' && ')
};
