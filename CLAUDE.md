# os-inventory

Desktop dashboard (macOS / Electron + React + TypeScript) that shows what's installed on the machine alongside the latest available version, so the user can see at a glance what's out of date. **Currently covers Homebrew formulae, Homebrew casks, npm globals, pip packages (Homebrew Python), VS Code extensions, Go `go install`'d binaries, and macOS `.app` bundles in `/Applications` (with Sparkle-based update checks).** Non-Homebrew Python environments are deferred but designed for.

## Commands

| Command                | What it does                                                     |
|------------------------|------------------------------------------------------------------|
| `npm run dev`          | `electron-vite dev` — starts main + renderer with HMR and opens the app window. |
| `npm run build`        | Full typecheck + production bundle (`out/`). No packaging.       |
| `npm run build:mac`    | `electron-vite build` + `electron-builder --mac` → signed-ish `.dmg`/`.zip` in `dist/`. Not wired for signing/notarization yet. |
| `npm run typecheck`    | `tsc --noEmit` for both `tsconfig.node.json` and `tsconfig.web.json`. |
| `npm run lint`         | ESLint with the electron-toolkit config.                         |

## Architecture

```
┌─────────────────────────────┐     IPC      ┌──────────────────────────┐
│ Renderer (React)            │◀────────────▶│ Main (Node)              │
│  src/renderer/              │              │  src/main/               │
│  • App, RefreshBar, Table   │              │  • spawns /opt/hb/bin/brew│
│  • subscribes to progress   │              │  • parses brew JSON      │
│  • reads via window.api     │              │  • read/write snapshot   │
└─────────────────────────────┘              └──────────────────────────┘
                                                        │
                                                        ▼
                                  app.getPath('userData') / snapshot.json
                                  (~/Library/Application Support/os-inventory)
```

- **Main** owns all child processes and disk I/O. Renderer never touches the FS or spawns processes.
- **Preload** (`src/preload/index.ts`) exposes a narrow `window.api` via `contextBridge` (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`). No raw `ipcRenderer` leaks.
- **Renderer** is a plain React 19 app — no router, no state library, no UI framework.

## Layout

```
src/
├── main/
│   ├── index.ts        app lifecycle, BrowserWindow, IPC handlers
│   ├── brew.ts         runBrew() + fetchInstalled() (formulae + casks)
│   ├── npm.ts          runNpm() + fetchNpmGlobals()
│   ├── pip.ts          runPip() + fetchPipGlobals()
│   ├── vscode.ts       `code --list-extensions` + marketplace query
│   ├── go.ts           `go version -m` on $GOBIN + module proxy lookup
│   ├── apps.ts         walks /Applications, reads Info.plist, fetches Sparkle appcasts
│   └── cache.ts        atomic read/write of snapshot.json
├── preload/
│   ├── index.ts        contextBridge → window.api
│   └── index.d.ts      ambient Window typing for renderer
├── shared/
│   └── types.ts        Package, Snapshot, RefreshProgress, OsInventoryApi
└── renderer/
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── components/
        │   ├── RefreshBar.tsx
        │   └── PackageTable.tsx
        └── assets/main.css
```

`Package` is a discriminated union on `kind: 'formula' | 'cask' | 'npm-global' | 'pip-global' | 'vscode-extension' | 'go-install' | 'macos-app'` with optional `pinned` (formulae) and `autoUpdates` (casks). The renderer renders all kinds through a single `PackageTable` component, switched by a tab bar in `App.tsx`. Tabs are defined in a `TABS` config array — add a new ecosystem by extending that array and the `itemsFor` switch.

`src/shared/types.ts` is the single source of truth for types crossing the IPC boundary. It is included in both `tsconfig.node.json` and `tsconfig.web.json`.

## IPC contract

Defined on `window.api` via `src/preload/index.ts`:

| Method                          | Channel             | Returns                 |
|---------------------------------|---------------------|-------------------------|
| `getSnapshot()`                 | `brew:getSnapshot`  | `Snapshot \| null`      |
| `refresh()`                     | `brew:refresh`      | `Snapshot` (throws on failure) |
| `onProgress(cb)`                | `brew:progress` (push) | unsubscribe function |

`refresh()` performs:
1. `brew update --quiet` — refresh tap clones so `versions.stable` is current.
2. `brew info --json=v2 --installed` — parse installed formulae + latest stable + outdated flag.
3. Write `snapshot.json` atomically (temp file + rename).

## Brew commands used

- `brew update --quiet` — refresh local tap clones.
- `brew info --json=v2 --installed` — primary data source. Returns both `formulae[]` and `casks[]` in one call. Fields used:
  - **Formulae:** `name`, `desc`, `installed[0].version` → installed, `versions.stable` → latest, `outdated`, `pinned`.
  - **Casks:** `token` → name, `name[0]` → display name, `desc`, `installed` → installed, `version` → latest, `outdated`, `auto_updates` (surfaced as a "self-updates" badge — when true, brew's version may lag behind the app's actual version).

We do **not** call `brew outdated` separately — `brew info` already surfaces the `outdated` flag per item.

## npm commands used

Run in parallel on every refresh:

- `npm ls -g --json --depth=0` — currently installed global packages with versions (`dependencies[pkg].version`).
- `npm outdated -g --json` — outdated globals with `current`, `wanted`, `latest`. **Exit code 1 when anything is outdated** — `runNpmAllowStatus1` tolerates that and still parses stdout.

Merge: for each entry in `ls`, overlay `outdated` if present. If not outdated, `installed === latest`. `outdated: true` only when installed ≠ latest (defensive — npm's reporting can be weirdly inclusive).

## pip commands used

Run in parallel on every refresh:

- `pip list --format=json` — installed packages `[{name, version}]`.
- `pip list --outdated --format=json` — outdated packages `[{name, version, latest_version}]`.

Merge: iterate installed list, overlay the outdated map by name. `PIP_DISABLE_PIP_VERSION_CHECK=1` suppresses pip's own "new version available" banner on stderr.

Pip exits 0 for both commands regardless of outdated state, unlike npm.

## VS Code extensions

Two-step on every refresh:

1. `/usr/local/bin/code --list-extensions --show-versions` — one `publisher.name@version` line per extension.
2. Batched POST to the public VS Code Marketplace:
   `https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery`
   with body `{ filters: [{ criteria: [{filterType:7,value:"pub.name"}, …] }], flags: 17 }`.
   `flags=17` = `IncludeVersions | IncludeVersionProperties` — we need the full version history with per-version properties so we can filter out pre-releases client-side.

Merge: for each installed ext, look up `publisher.extensionName` (lowercased) in the marketplace response and walk `versions` (newest-first) to find the first entry whose properties array does **not** include `{ key: "Microsoft.VisualStudio.Code.PreRelease", value: "true" }`. That's the latest stable. Missing from marketplace → `latest = installed`, not outdated.

This avoids spurious "outdated" markers for stable-track users when publishers ship daily pre-releases (e.g. `ms-python.python`). Trade-off: responses are larger than with `IncludeLatestVersionOnly` (full version history per extension) — if this becomes slow, switch to chunked parallel queries in `queryMarketplace`.

Marketplace failure is tolerated: we log it and fall back to `latest = installed` (all marked up-to-date) so a dead network doesn't break the whole refresh.

## Go binaries

Covers binaries installed via `go install <path>@...` into `$GOBIN` (falls back to `$GOPATH/bin`, then `~/go/bin`). Steps per refresh:

1. `go env GOBIN GOPATH` — resolve the install directory.
2. `readdir` that directory, then `go version -m <file1> <file2> …` on all entries in one call. The parser reads header lines (`/path/to/bin: goX.Y.Z`) and indented tab-separated `path` / `mod` lines; non-Go files produce a header with no `mod` line and are silently skipped.
3. For each distinct module, fetch `https://proxy.golang.org/<escaped-module>/@latest` in parallel (uppercase letters in the path are escaped as `!lower` per the module proxy protocol). Response is `{Version, Time}` — we only use `Version`.

`installedVersion` comes from the `mod` line (the tagged version `go install` resolved), `latestVersion` from the proxy. Missing from proxy / proxy failure → `latest = installed`, not outdated. Pseudo-versions and `(devel)` are compared as plain strings; if you `go install`'d from a local checkout the entry will likely read as outdated once any tag is cut.

`name` is the full install path (e.g. `honnef.co/go/tools/cmd/staticcheck`) so each binary is uniquely keyed; `displayName` is the short filename shown primarily in the UI.

## Desktop apps (macOS `.app` bundles)

Covers arbitrary `.app` bundles outside the Homebrew ecosystem. Scans `/Applications`, `/Applications/Utilities`, and `~/Applications`, then for each bundle:

1. Runs `/usr/bin/plutil -convert json -o - <bundle>/Contents/Info.plist` to read the plist. Unreadable / non-convertible plists cause the bundle to be silently skipped.
2. Pulls `CFBundleShortVersionString` (falls back to `CFBundleVersion`) for installed; `CFBundleDisplayName` / `CFBundleName` for display; `CFBundleIdentifier` as the unique key; `SUFeedURL` for the Sparkle appcast.
3. If a `SUFeedURL` is present, fetches it (10s `AbortController` timeout, `Accept: application/xml`) and pulls the first `<item>` from the feed. Reads `sparkle:shortVersionString` (preferred) or `sparkle:version` — both element and attribute forms — as the latest version.

**Dedupe with Homebrew casks:** `src/main/brew.ts` also returns `caskAppNames: Set<string>` built from each cask's `artifacts[].app[]` field. Any bundle whose basename appears in that set is dropped — it's already shown in the Casks tab. This is why `fetchInstalled` is called before `fetchInstalledApps` in `main/index.ts`.

Apps without a Sparkle feed (no `SUFeedURL`, or the feed failed/timed out) leave `latestVersion = ''` and render as a muted "unknown" badge rather than "up to date" — we can't claim currency if we don't have a signal. No Mac App Store apps are covered yet (would need `mas outdated` and some heuristic to recognize MAS-installed bundles).

## Persistence

Snapshot JSON is stored at `~/Library/Application Support/os-inventory/snapshot.json`. The renderer asks for it on mount and paints immediately, so there's no blank screen while brew runs on first launch of a session. Refresh is explicit (button press).

## Known gotchas

- **CLI paths are hard-coded** to `/opt/homebrew/bin/brew`, `/opt/homebrew/bin/npm`, `/opt/homebrew/bin/pip3`, `/usr/local/bin/code`, `/opt/homebrew/bin/go`, and `/usr/bin/plutil`. Reason: GUI apps on macOS don't inherit the shell's `PATH`, so `execFile('brew', ...)` fails when launched from Finder / Dock. When adding Intel Mac support or a configurable override, update the constants at the top of each `src/main/<eco>.ts`.
- **Pip targets the Homebrew Python only.** pyenv/asdf/system Python site-packages are NOT inspected. Multi-interpreter support is a future enhancement — likely a settings UI where the user picks which pip to query.
- **`brew update` is slow** (10–30s cold). We run it on every refresh so "latest version" is genuinely current. Don't remove it without a replacement freshness strategy.
- **No auto-update, no auto-refresh timer.** Refresh is always manual.
- **Not code-signed / notarized.** `build:mac` produces an unsigned bundle; Gatekeeper will complain on first launch until signing is wired.
- **`HOMEBREW_NO_AUTO_UPDATE=1` is set** in the brew env to prevent spurious updates inside `brew info` calls — we control update timing explicitly.

## Adding a new ecosystem (deferred scope)

The shape is:

1. Add `src/main/<ecosystem>.ts` exposing `fetchSomething(onProgress): Promise<Item[]>`.
2. Extend `Snapshot` in `src/shared/types.ts` (e.g., `{ brewFormulae, npmGlobals, pip, casks }`). Each section has its own `refreshedAt` so partial refresh is possible later.
3. Add an IPC channel per source (or a unified `refresh({ sources: [...] })`).
4. In the renderer, add a tab switcher above the table.

Candidates to implement next:
- **Mac App Store apps** — use `mas list` / `mas outdated` to surface App Store-installed bundles (currently excluded because they have no Sparkle feed).
- **Additional Python interpreters** — detect pyenv/asdf shims or let the user add paths; query each pip3 separately.

## Non-goals for v0

- No auto-update of the app itself, no code signing/notarization pipeline.
- No notifications when a new version becomes available.
- No settings UI (brew path override, refresh cadence, etc.).
- No cross-platform support — macOS only (Linux brew works but cask/path assumptions break; Windows is out of scope).
