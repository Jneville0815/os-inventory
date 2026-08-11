# os-inventory

Desktop dashboard (macOS / Electron + React + TypeScript) that shows what's installed on the machine alongside the latest available version, so the user can see at a glance what's out of date.

**Nothing is tracked by default.** On first launch the user picks which *sources* to inventory in Settings; each tracked source becomes a tab, in the order they chose. Built-in sources: Homebrew formulae, Homebrew casks, npm globals, VS Code extensions, Go `go install`'d binaries, and macOS `.app` bundles in `/Applications` (with Sparkle-based update checks).

**Users can also define their own sources** — a command plus a way to read its output — so an ecosystem the app has never heard of can still be tracked without a code change. See *Custom sources* below.

## Commands

| Command                | What it does                                                     |
|------------------------|------------------------------------------------------------------|
| `npm run dev`          | `electron-vite dev` — starts main + renderer with HMR and opens the app window. |
| `npm run build`        | Full typecheck + production bundle (`out/`). No packaging.       |
| `npm run build:mac`    | `electron-vite build` + `electron-builder --mac` → `.dmg`/`.zip` in `dist/`. Signed with the local Apple Development cert; not notarized, not distributable. |
| `npm run typecheck`    | `tsc --noEmit` for both `tsconfig.node.json` and `tsconfig.web.json`. |
| `npm run lint`         | ESLint with the electron-toolkit config.                         |
| `npm test`             | Vitest, once. `npm run test:watch` to keep it running.           |

## Tests

`*.test.ts` files sit next to the code they cover, so `npm run typecheck` covers them too. They target the **parsers and merge rules** — the parts that silently break when an upstream tool changes its output format, which is the failure mode that produces wrong version claims rather than a visible crash.

Everything under test is a pure function taking a fixture string or object; nothing spawns a process or hits the network. That's the reason `mergeNpmGlobals`, `toFormulaPackages`, `toCaskPackages`, `collectCaskAppNames`, `parseVersionOutput`, `parseAppcast`, `satisfiesEngine`, `latestStableVersion`, the `customParse.ts` parsers and `splitArgs` are exported at all — keep new parsing logic separable the same way.

`settings.test.ts` mocks `electron` (`vi.mock`) purely so the module can be imported; `normalizeSettings` itself touches no filesystem.

Not covered: process spawning, path resolution, and IPC — verified by running the app instead.

## Architecture

```
┌─────────────────────────────┐     IPC      ┌───────────────────────────┐
│ Renderer (React)            │◀────────────▶│ Main (Node)               │
│  src/renderer/              │              │  src/main/                │
│  • tabs derived from        │              │  • source registry        │
│    settings.sources         │              │  • spawns the CLIs        │
│  • SettingsPanel edits them │              │  • read/write snapshot    │
│  • reads via window.api     │              │    + settings             │
└─────────────────────────────┘              └───────────────────────────┘
                                                        │
                                                        ▼
                              app.getPath('userData') / snapshot.json
                                                       / settings.json
                              (~/Library/Application Support/os-inventory)
```

- **Main** owns all child processes and disk I/O. Renderer never touches the FS or spawns processes.
- **Preload** (`src/preload/index.ts`) exposes a narrow `window.api` via `contextBridge` (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`). No raw `ipcRenderer` leaks.
- **Renderer** is a plain React 19 app — no router, no state library, no UI framework.
- **Nothing names a specific ecosystem outside `src/main/sources/`.** `main/index.ts`, `refresh.ts` and the renderer all work off the registry.

## Layout

```
src/
├── main/
│   ├── index.ts        app lifecycle, BrowserWindow, IPC handlers
│   ├── refresh.ts      runs tracked sources concurrently, isolates failures
│   ├── settings.ts     read/write/normalize settings.json
│   ├── cache.ts        read/write snapshot.json
│   ├── jsonStore.ts    shared atomic JSON read/write
│   ├── tools.ts        resolves CLI paths (override → candidates → PATH)
│   ├── childEnv.ts     widened PATH for spawned processes
│   ├── exec.ts         execTool/execToolAllowExit (handles Windows .cmd)
│   └── sources/
│       ├── source.ts          the Source contract + shared helpers
│       ├── index.ts           BUILT_IN registry + resolveSources()/describeSources()
│       ├── custom.ts          turns a user config into a Source; testCustomSource()
│       ├── customParse.ts     regex / TSV / JSON output parsers (pure)
│       ├── homebrew.ts        shared `brew info` + formula and cask sources
│       ├── npmGlobals.ts      `npm ls -g` + `npm outdated -g`
│       ├── vscodeExtensions.ts `code --list-extensions` + marketplace query
│       ├── goInstall.ts       `go version -m` on $GOBIN + module proxy
│       └── macosApps.ts       walks /Applications, Info.plist, Sparkle appcasts
├── preload/
│   ├── index.ts        contextBridge → window.api
│   └── index.d.ts      ambient Window typing for renderer
├── shared/
│   └── types.ts        Package, Snapshot, Settings, SourceDescriptor, OsInventoryApi
└── renderer/
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── components/
        │   ├── RefreshBar.tsx
        │   ├── PackageTable.tsx
        │   ├── SettingsPanel.tsx
        │   ├── CustomSourceForm.tsx
        │   └── CopyCommandButton.tsx
        ├── lib/splitArgs.ts
        └── assets/main.css
```

## Data model

`Package` carries a `sourceId` and a `status: 'outdated' | 'current' | 'held' | 'unknown'`, plus optional `badges` for source-specific annotations. `unknown` means we found no update feed and therefore can't claim currency; `held` means deliberately frozen (`brew pin` today, `apt-mark hold` / `winget pin` later). Formula pins and cask `auto_updates` are badges, not fields on `Package` — a new source can annotate rows without touching shared types.

`Snapshot` is `{ schema: 2, refreshedAt, sources: Record<SourceId, SourceResult> }`. Each `SourceResult` records its own `state: 'ok' | 'error'`, `error`, `items`, and a precomputed `upgradeCommand`. A snapshot contains exactly the tracked sources — untracking one drops its data rather than leaving stale rows.

The renderer renders every source through the one `PackageTable`, with tabs derived from `settings.sources`. **There is no per-ecosystem branching in the renderer.**

`src/shared/types.ts` is the single source of truth for types crossing the IPC boundary. It is included in both `tsconfig.node.json` and `tsconfig.web.json`.

## IPC contract

Defined on `window.api` via `src/preload/index.ts`:

| Method               | Channel                     | Returns                        |
|----------------------|-----------------------------|--------------------------------|
| `getSnapshot()`      | `inventory:getSnapshot`     | `Snapshot \| null`             |
| `refresh()`          | `inventory:refresh`         | `Snapshot`                     |
| `onProgress(cb)`     | `inventory:progress` (push) | unsubscribe function           |
| `getSettings()`      | `inventory:getSettings`     | `Settings`                     |
| `saveSettings(s)`    | `inventory:saveSettings`    | `Settings` (normalized)        |
| `listSources()`      | `inventory:listSources`     | `SourceDescriptor[]`           |
| `testCustomSource(s)`| `inventory:testCustomSource`| `CustomSourceTest`             |

`refresh()` reads settings, runs every tracked source **concurrently**, and writes `snapshot.json` atomically. It only rejects on catastrophic failure — an individual source that throws is recorded as `state: 'error'` on its own `SourceResult`, so one missing CLI or dead network can't empty the other tabs. Concurrent calls (auto-refresh timer landing on a manual click) share one in-flight promise; see `inFlight` in `src/main/index.ts`.

`listSources()` re-runs detection on every call, so a tool installed — or a path corrected — while the app is open shows up without a restart.

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

## VS Code extensions

Two-step on every refresh:

1. `code --list-extensions --show-versions` — one `publisher.name@version` line per extension.
2. Batched POST to the public VS Code Marketplace:
   `https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery`
   with body `{ filters: [{ criteria: [{filterType:7,value:"pub.name"}, …] }], flags: 17 }`.
   `flags=17` = `IncludeVersions | IncludeVersionProperties` — we need the full version history with per-version properties so we can filter out pre-releases client-side.

Merge: for each installed ext, look up `publisher.extensionName` (lowercased) in the marketplace response and walk `versions` (newest-first) to find the first entry that (a) does **not** have `Microsoft.VisualStudio.Code.PreRelease = "true"` and (b) whose `Microsoft.VisualStudio.Code.Engine` caret-range (e.g. `^1.117.0`) is satisfied by the installed VS Code (`code --version`, parsed once per refresh). That's the latest compatible stable. Missing from marketplace → `latest = installed`, not outdated.

This avoids (a) spurious "outdated" markers for stable-track users when publishers ship daily pre-releases (e.g. `ms-python.python`), and (b) flagging a version that VS Code itself won't install because it requires a newer editor — `code --update-extensions` would silently skip it, making the app's claim wrong. Engine-range parsing only supports caret (`^X.Y.Z`); anything else is treated as compatible.

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

**Dedupe with Homebrew casks:** `src/main/sources/homebrew.ts` also returns `caskAppNames: Set<string>` built from each cask's `artifacts[].app[]` field. Any bundle whose basename appears in that set is dropped — it's already shown in the Casks tab. This only applies **when the user tracks Brew Casks**; otherwise there's no Casks tab to show them in and hiding them here would lose them entirely. If the brew call fails, dedupe falls back to an empty set — the Casks tab reports its own error, and showing the apps twice beats dropping them from both.

Apps without a Sparkle feed (no `SUFeedURL`, or the feed failed/timed out) leave `latestVersion = ''` and render as a muted "unknown" badge rather than "up to date" — we can't claim currency if we don't have a signal. No Mac App Store apps are covered yet (would need `mas outdated` and some heuristic to recognize MAS-installed bundles).

## Settings

`~/Library/Application Support/os-inventory/settings.json`, written atomically:

```jsonc
{
  "schema": 1,
  "sources": ["homebrew-formula", "custom:mas"],  // tracked, in tab order. [] by default.
  "customSources": [ /* see below */ ],           // defined, whether tracked or not
  "toolPaths": { "go": "/opt/custom/go" },        // overrides; absent means auto-detect
  "autoRefreshMinutes": 60                        // 0 = manual only
}
```

`settings.sources` **is** the enabled set — membership means tracked, and array order is tab order. There is no separate `enabled` flag. Everything read off disk or arriving over IPC goes through `normalizeSettings()`, which drops unknown source and tool ids and clamps the interval, so a hand-edited or newer-version file can't break the app.

The settings panel (`SettingsPanel.tsx`) shows **Tracked** (reorder / remove), **Available** (add), **Tool locations**, and **Refresh**. Undetected sources are still listed and still addable — detection can be wrong, and the resulting per-source error explains the problem better than a disabled button. Only sources unsupported on the current OS can't be added.

Closing the panel triggers a refresh iff some tracked source has no `ok` result yet — which covers both "just added something" and "just fixed a broken tool path", without refreshing on a pure reorder.

## Custom sources

A user-defined source is a command plus a rule for reading its stdout:

```jsonc
{
  "id": "custom:mas",              // always custom:<slug>; the slug is derived from the label
  "label": "Mac App Store",
  "itemNoun": "apps",              // fills "Filter apps…"
  "command": "mas",                // bare name (PATH lookup) or absolute path
  "args": ["outdated"],
  "mode": "regex",                 // regex | tsv | json
  "pattern": "^\\s*\\d+\\s+(?<name>.+?)\\s+\\((?<installed>[^\\s)]+)\\s*->\\s*(?<latest>[^)]+)\\)",
  "upgradeCommand": "mas upgrade", // optional
  "allowExitCodes": [1]            // optional; for tools that exit non-zero by design
}
```

The three modes trade generality against effort. `regex` parses a manager's native output — most have an `outdated` subcommand, which is why this covers so much. `tsv` (`name⇥installed⇥latest`) and `json` are the escape hatch: the user's own script can produce them from anything, including a registry API. Parsers live in `customParse.ts` and are pure, so they're unit-tested against fixture strings.

Row rules, same for all three modes: no `name` → the row is skipped; no `latest` → status is `unknown` rather than a false "up to date"; duplicate names are dropped (`PackageTable` keys on name); output is capped at 5000 rows.

`makeCustomSource()` turns the config into an ordinary `Source`, so nothing downstream distinguishes custom from built-in. The registry is `resolveSources(settings) = [...BUILT_IN, ...customSources.map(makeCustomSource)]`.

**Settings → Test** runs the command once without saving and returns raw stdout alongside the parsed rows (`testCustomSource()`). Writing a pattern blind is miserable; keep this working.

### Security

A custom source runs whatever command it names. That is inherent to the feature and fine for something the user typed themselves — they can already run anything as their own user. Two rules keep it that way:

- **No shell.** `execFile` with an args array and `shell: false`, so `;`, `|` and globs are literal argument text. A user who wants shell semantics asks for them explicitly by setting the command to `sh` with `-c`. `splitArgs()` does quote-aware splitting of the Settings field — it is not, and must not become, a shell parser.
- **Never auto-import.** The moment custom sources can be pasted from a URL or a shared file, this becomes a malware delivery vector. If sharing is ever added, show the exact command and require explicit confirmation.

Commands also carry a 60s timeout so a hung tool can't wedge a refresh.

## Persistence

`snapshot.json` sits beside `settings.json`. The renderer asks for it on mount and paints immediately, so there's no blank screen while brew runs on first launch of a session. `readSnapshot()` returns `null` for any file whose `schema` isn't current — the cache is rebuilt by one Refresh, so there's no migration code to carry.

## Known gotchas

- **CLI paths are resolved, not hard-coded** — `src/main/tools.ts` tries the user's Settings override, then a per-platform candidate list, then a `which`/`where` lookup. Reason GUI apps need this at all: macOS launchd starts them with a bare `PATH`, so `execFile('brew', ...)` fails when launched from Finder / Dock. Add new CLIs to `CANDIDATES` there, not as a constant in a source module. `plutil` is the one exception — it ships with macOS at a fixed path.
- **The same missing-`PATH` problem also bites child processes those CLIs spawn internally.** `npm`'s global CLI is a script with a `#!/usr/bin/env node` shebang — `env` resolves `node` via the *child's* `PATH`, so even with an absolute npm path, a Finder-launched app fails with `env: node: No such file or directory`. Fixed via `src/main/childEnv.ts`, which every `execFile`/`execFileAsync` call uses instead of raw `process.env`. Use it for any new spawned process.
- **`brew update` is slow** (10–30s cold). We run it on every refresh so "latest version" is genuinely current. Don't remove it without a replacement freshness strategy. It runs once per refresh no matter how many brew-backed sources are tracked — `sharedBrewInfo()` memoises on the per-refresh `ctx.shared` map.
- **No auto-update of the app itself.** Auto-*refresh* is user-configurable and defaults to hourly.
- **Signed, but not distributable.** `build:mac` does sign — `electron-builder` auto-discovers a signing identity in the keychain and currently picks up an *Apple Development* certificate. That's a development cert, not a **Developer ID Application** cert, and `notarize: false` in `electron-builder.yml` disables notarization. `spctl -a -t exec` rejects the output: it launches on the machine that built it, but Gatekeeper blocks it everywhere else. Shipping to other people needs a Developer ID cert plus notarization turned on. A clone with no identity in its keychain falls back to an unsigned bundle.
- **`HOMEBREW_NO_AUTO_UPDATE=1` is set** in the brew env to prevent spurious updates inside `brew info` calls — we control update timing explicitly.

## Adding a new source

First ask whether it needs to be built in at all — if the manager has an `outdated`-style command, a user can already track it as a custom source. Built-ins earn their keep by being zero-config: detection, an upgrade command, and no pattern to write.

Three steps, no renderer changes:

1. Add the id to `SourceId` in `src/shared/types.ts` (and a new `ToolId` + entry in `CANDIDATES` in `src/main/tools.ts` if it shells out to a CLI the app doesn't already know).
2. Write `src/main/sources/<name>.ts` exporting a `Source` — see `src/main/sources/source.ts` for the contract. Use `detectViaTool(id)` for detection, `requireTool()` to get the resolved path (it throws with a message worth showing), `statusFor()` for the status rule, and `ctx.note()` for sub-step progress.
3. Append it to `SOURCES` in `src/main/sources/index.ts`.

It then appears in Settings → Available automatically. Existing users are unaffected until they add it.

Candidates to implement next:
- **Windows** — winget, Scoop, Chocolatey, and installed programs from the `…\CurrentVersion\Uninstall` registry keys. npm / VS Code / Go already declare `win32` support and just need their paths verified.
- **Linux** — apt/dpkg, dnf/rpm, pacman, Flatpak, Snap.
- **Mac App Store apps** — `mas list` / `mas outdated`, currently excluded because they have no Sparkle feed.

## Non-goals for now

- No auto-update of the app itself, no Developer ID signing/notarization pipeline.
- No notifications when a new version becomes available.
- No tracking of individual hand-picked packages — tracking is per-source.
- No sharing or importing of custom source definitions (see the security note above).
- Cross-platform is *prepared for* but unproven: sources declare `platforms` and paths resolve per-OS, but only macOS is tested. Linux and Windows need their own sources plus a real run.
