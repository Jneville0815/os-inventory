import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { promisify } from 'node:util';
import { basename, join } from 'node:path';
import { homedir } from 'node:os';
import type { Package, RefreshProgress } from '../shared/types';

const execFileAsync = promisify(execFile);

const PLUTIL_PATH = '/usr/bin/plutil';
const APP_DIRS = [
  '/Applications',
  '/Applications/Utilities',
  join(homedir(), 'Applications')
];

const APPCAST_TIMEOUT_MS = 10_000;

type InfoPlist = {
  CFBundleIdentifier?: string;
  CFBundleShortVersionString?: string;
  CFBundleVersion?: string;
  CFBundleName?: string;
  CFBundleDisplayName?: string;
  SUFeedURL?: string;
};

async function readInfoPlist(appPath: string): Promise<InfoPlist | null> {
  const plistPath = join(appPath, 'Contents', 'Info.plist');
  try {
    const { stdout } = await execFileAsync(
      PLUTIL_PATH,
      ['-convert', 'json', '-o', '-', plistPath],
      { maxBuffer: 4 * 1024 * 1024 }
    );
    return JSON.parse(stdout) as InfoPlist;
  } catch {
    // Missing plist, unreadable, non-JSON-convertible — skip the app.
    return null;
  }
}

async function listAppBundles(): Promise<string[]> {
  const results: string[] = [];
  for (const dir of APP_DIRS) {
    try {
      const entries = await readdir(dir);
      for (const name of entries) {
        if (name.endsWith('.app')) results.push(join(dir, name));
      }
    } catch {
      // Directory doesn't exist — skip.
    }
  }
  return results;
}

function parseAppcast(xml: string): string | null {
  // First <item> in a Sparkle feed is the latest release.
  const itemMatch = xml.match(/<item\b[\s\S]*?<\/item>/);
  if (!itemMatch) return null;
  const item = itemMatch[0];
  const shortVer =
    item.match(/<sparkle:shortVersionString[^>]*>([^<]+)<\/sparkle:shortVersionString>/)?.[1] ??
    item.match(/sparkle:shortVersionString="([^"]+)"/)?.[1];
  const buildVer =
    item.match(/<sparkle:version[^>]*>([^<]+)<\/sparkle:version>/)?.[1] ??
    item.match(/sparkle:version="([^"]+)"/)?.[1];
  return (shortVer ?? buildVer ?? null)?.trim() || null;
}

async function fetchAppcastVersion(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), APPCAST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/xml, text/xml, */*' },
      signal: controller.signal
    });
    if (!res.ok) return null;
    const xml = await res.text();
    return parseAppcast(xml);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchInstalledApps(
  caskAppNames: Set<string>,
  onProgress: (p: RefreshProgress) => void
): Promise<Package[]> {
  onProgress({ phase: 'querying-apps' });

  const paths = await listAppBundles();
  const unclaimed = paths.filter((p) => !caskAppNames.has(basename(p)));

  const plists = await Promise.all(
    unclaimed.map(async (path) => ({ path, plist: await readInfoPlist(path) }))
  );
  const parsed = plists.filter(
    (x): x is { path: string; plist: InfoPlist } => x.plist !== null
  );

  const latestVersions = await Promise.all(
    parsed.map(({ plist }) =>
      plist.SUFeedURL ? fetchAppcastVersion(plist.SUFeedURL) : Promise.resolve(null)
    )
  );

  return parsed
    .map<Package>(({ path, plist }, i) => {
      const base = basename(path).replace(/\.app$/, '');
      const installed =
        plist.CFBundleShortVersionString ?? plist.CFBundleVersion ?? '';
      const latest = latestVersions[i] ?? '';
      const displayName =
        plist.CFBundleDisplayName ?? plist.CFBundleName ?? base;
      return {
        kind: 'macos-app',
        name: plist.CFBundleIdentifier ?? base,
        displayName,
        installedVersion: installed,
        latestVersion: latest,
        outdated: Boolean(installed) && Boolean(latest) && latest !== installed
      };
    })
    .sort((a, b) =>
      (a.displayName ?? a.name).localeCompare(b.displayName ?? b.name)
    );
}
