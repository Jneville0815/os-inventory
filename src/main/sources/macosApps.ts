import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { promisify } from 'node:util';
import { basename, join } from 'node:path';
import { homedir } from 'node:os';
import type { Package } from '../../shared/types';
import { sharedBrewInfo } from './homebrew';
import { sortByDisplayName, statusFor, type RefreshCtx, type Source } from './source';

const execFileAsync = promisify(execFile);

const PLUTIL_PATH = '/usr/bin/plutil';
const APP_DIRS = ['/Applications', '/Applications/Utilities', join(homedir(), 'Applications')];

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
  try {
    const { stdout } = await execFileAsync(
      PLUTIL_PATH,
      ['-convert', 'json', '-o', '-', join(appPath, 'Contents', 'Info.plist')],
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
      for (const name of await readdir(dir)) {
        if (name.endsWith('.app')) results.push(join(dir, name));
      }
    } catch {
      // Directory doesn't exist — skip.
    }
  }
  return results;
}

/** The first <item> in a Sparkle feed is the latest release. */
export function parseAppcast(xml: string): string | null {
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
    return parseAppcast(await res.text());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Bundles owned by Homebrew casks, so they aren't listed twice. Only deduped
 * when the user actually tracks casks — otherwise the Casks tab isn't there to
 * show them and hiding them here would lose them entirely.
 */
async function caskOwnedApps(ctx: RefreshCtx): Promise<Set<string>> {
  if (!ctx.settings.sources.includes('homebrew-cask')) return new Set();
  try {
    return (await sharedBrewInfo(ctx)).caskAppNames;
  } catch {
    // Brew failed — its own tab reports that. Showing the apps here is the
    // better failure mode than dropping them from both tabs.
    return new Set();
  }
}

export const macosApps: Source = {
  id: 'macos-app',
  label: 'Desktop Apps',
  itemNoun: 'apps',
  description: 'Applications in /Applications, with Sparkle update feeds where published.',
  platforms: ['darwin'],
  // plutil ships with macOS, so there's nothing to detect or configure.
  detect: async () => ({ detected: process.platform === 'darwin' }),

  fetch: async (ctx) => {
    const [paths, claimed] = await Promise.all([listAppBundles(), caskOwnedApps(ctx)]);
    const unclaimed = paths.filter((p) => !claimed.has(basename(p)));

    const plists = await Promise.all(
      unclaimed.map(async (path) => ({ path, plist: await readInfoPlist(path) }))
    );
    const parsed = plists.filter(
      (x): x is { path: string; plist: InfoPlist } => x.plist !== null
    );

    ctx.note('checking update feeds');
    const latestVersions = await Promise.all(
      parsed.map(({ plist }) =>
        plist.SUFeedURL ? fetchAppcastVersion(plist.SUFeedURL) : Promise.resolve(null)
      )
    );

    return parsed
      .map<Package>(({ path, plist }, i) => {
        const base = basename(path).replace(/\.app$/, '');
        const installed = plist.CFBundleShortVersionString ?? plist.CFBundleVersion ?? '';
        // No Sparkle feed → latest stays empty and the row reads "unknown".
        const latest = latestVersions[i] ?? '';
        return {
          sourceId: 'macos-app',
          name: plist.CFBundleIdentifier ?? base,
          displayName: plist.CFBundleDisplayName ?? plist.CFBundleName ?? base,
          installedVersion: installed,
          latestVersion: latest,
          status: statusFor(latest, Boolean(installed) && Boolean(latest) && latest !== installed)
        };
      })
      .sort(sortByDisplayName);
  }
};
