# os-inventory

Desktop dashboard (macOS / Electron + React + TypeScript) that shows which of your **developer dependencies are out of date** — what's installed alongside the latest available version, at a glance.

Built-in sources, all of them optional and none tracked by default:

| | |
|---|---|
| Homebrew | `brew install` formulae |
| JavaScript | npm, pnpm, Yarn and Bun globals |
| Python | pip packages, plus pipx and uv tools |
| Ruby | gems |
| Rust | `cargo install` crates |
| PHP | Composer global packages |
| Go | `go install` binaries |

Anything else, the user adds as a custom source.

## What this app is for

**Package managers that install developer dependencies.** That's the scope line — use it to answer "should we add X?" without a judgment call.

In: language and system package managers (brew, npm/pnpm/yarn/bun, pip/pipx/uv, gem, cargo, composer, go…). Out: **applications and their plugins** (VS Code extensions, JetBrains plugins), and **OS software** (system updates, Mac App Store, `/Applications` bundles, Homebrew casks).

That boundary is the point, not an accident. A list that's only package managers reads as a *category*; nobody thinks a package manager list is telling them what editor to use. Mixing in one editor's extensions and some OS software is what made an earlier version read as one developer's personal setup — the specific tools weren't the problem, the category mixing was.

Three rules follow, and together they're why the app shouldn't feel like it assumes a particular machine:

- **Nothing is tracked by default.** On first launch the user picks; each tracked source becomes a tab, in their order.
- **Settings leads with what's actually installed.** Undetected sources collapse behind a "show N more" toggle, so a Rust developer with no Go install never sees Go.
- **Custom sources cover the rest**, so the answer to "do you support X?" is never no.

Deleted in service of this, and recoverable from git history if the boundary ever moves: the VS Code extension source (marketplace query with pre-release and engine-range filtering), the macOS `.app`/Sparkle source, the Homebrew cask source, and a recipe library of one-click OS-software configs.

## Platform

**macOS only.** Not "macOS first" — there is no Windows or Linux code left in the
tree, and that's deliberate.

It used to pretend otherwise: every source declared a `platforms` array, `tools.ts`
carried `win32`/`linux` candidate paths, `exec.ts` had a whole branch for Windows'
refusal to spawn `.cmd` files without a shell, and Settings had a "Not available on
this operating system" state. None of it had ever run on Windows or Linux. Untested
branches that claim to work are worse than absent ones — they invite trust they
haven't earned — so they're gone, along with `isSupported()`, `SourceDescriptor.supported`,
and the `win`/`nsis`/`linux`/`appImage` electron-builder targets.

**To bring a platform back**, `git show` the commit that removed this (search the log
for "Narrow the whole project to macOS") for the shape of what was there. Then expect
to actually run it on that OS — the previous attempt's bugs were only found by
reading Node's docs closely, not by testing, which is exactly why this is gone.

Both Apple Silicon and Intel Macs are supported by the same build.

## Licensing model

**The Sublime Text model, deliberately and exactly.**

- **Free to download, open source, and fully functional.** No feature gates, no
  time limit, no crippling. Every source, custom sources included, works
  unlicensed and always will.
- **A licence is requested, not enforced.** After a number of refreshes, an
  unlicensed copy shows a modal asking you to buy one — *Buy a licence* /
  *Enter licence* / *Not now* — and an `unregistered` chip sits in the header.
  Dismissing it costs nothing and blocks nothing.
- **One-time purchase, version-limited.** A 1.x licence covers every 1.x
  release; a future 2.0 is a paid upgrade. That's the `maxMajor` field in the
  key payload.
- **Verified offline.** The key is a signed blob pasted into Settings. The app
  never contacts a licence server — there isn't one to contact.

### Not the Mac App Store — and not by preference

Direct download only. This isn't a business-model choice that could be revisited
later: **App Store apps must carry the App Sandbox entitlement, and a sandboxed
app cannot execute binaries outside its container.** This app's entire function
is spawning `/opt/homebrew/bin/brew`, `/usr/bin/gem`, the user's `cargo`, and
whatever arbitrary command a custom source names. Sandboxed, it can do none of
that. The App Store is technically closed to this app, not merely unattractive.

(Not to be confused with `sandbox: false` in the BrowserWindow's `webPreferences`
— that's Electron's *renderer* sandbox, a different mechanism entirely.)

The practical consequence runs the other way from what you might expect:
**shipping outside the App Store makes notarization more important, not less.**
A direct-download app that isn't signed with a Developer ID and notarized gets
"cannot be opened because the developer cannot be verified" from Gatekeeper,
and most people stop there.

### Don't harden the check

The source is public and MIT, so the verification public key is visible and the
check is a few lines anyone can delete. That is also true of Sublime Text, and it
sustains them. This is an honour system backed by convenience — a signed,
notarized, auto-updating build you didn't have to compile. **Spend no effort on
obfuscation, tamper-detection, or phone-home checks**; they don't work, they
punish honest users, and they'd contradict the privacy claim.

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
│   ├── registry.ts     PyPI / npm latest-version lookups (concurrency-capped)
│   ├── childEnv.ts     widened PATH for spawned processes
│   ├── exec.ts         execTool/execToolAllowExit (no shell, ever)
│   └── sources/
│       ├── source.ts          the Source contract + shared helpers
│       ├── index.ts           BUILT_IN registry + resolveSources()/describeSources()
│       ├── custom.ts          turns a user config into a Source; testCustomSource()
│       ├── customParse.ts     regex / TSV / JSON output parsers (pure)
│       ├── homebrew.ts        `brew update` + `brew info --json=v2 --installed`
│       ├── npmGlobals.ts      `npm ls -g` + `npm outdated -g`
│       ├── pnpmGlobals.ts    `pnpm ls -g` + `pnpm outdated -g`
│       ├── yarnGlobals.ts    `yarn global list` + npm registry
│       ├── bunGlobals.ts     `bun outdated --global` (ASCII table)
│       ├── pip.ts             `pip list --outdated --format=json`
│       ├── pipx.ts            `pipx list --json` + PyPI
│       ├── uvTools.ts         `uv tool list` + PyPI
│       ├── gem.ts             `gem outdated`
│       ├── cargo.ts           `cargo install --list` + crates.io batch lookup
│       ├── composer.ts        `composer global outdated --format=json`
│       └── goInstall.ts       `go version -m` on $GOBIN + module proxy
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

`Package` carries a `sourceId` and a `status: 'outdated' | 'current' | 'held' | 'unknown'`, plus optional `badges` for source-specific annotations. `unknown` means we found no update feed and therefore can't claim currency; `held` means deliberately frozen (`brew pin` today, `apt-mark hold` / `winget pin` later). A Homebrew pin is a badge rather than a field on `Package`, so a new source can annotate rows without touching shared types.

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
- `brew info --json=v2 --installed` — primary data source. Fields used: `name`, `desc`, `installed[0].version` → installed, `versions.stable` → latest, `outdated`, `pinned`. The response also carries a `casks[]` array, which we ignore: casks install GUI applications, not developer dependencies.

We do **not** call `brew outdated` separately — `brew info` already surfaces the `outdated` flag per item.

## npm commands used

Run in parallel on every refresh:

- `npm ls -g --json --depth=0` — currently installed global packages with versions (`dependencies[pkg].version`).
- `npm outdated -g --json` — outdated globals with `current`, `wanted`, `latest`. **Exit code 1 when anything is outdated** — `runNpmAllowStatus1` tolerates that and still parses stdout.

Merge: for each entry in `ls`, overlay `outdated` if present. If not outdated, `installed === latest`. `outdated: true` only when installed ≠ latest (defensive — npm's reporting can be weirdly inclusive).

## Python packages (pip)

`pip list --outdated --format=json` reports installed and latest together, so there's no registry call to make:

```json
[{"name": "packaging", "version": "26.1", "latest_version": "26.3", "latest_filetype": "wheel"}]
```

Field names are pip's own — `version` and `latest_version` — mapped in `toPipPackages`. Packages that are current simply aren't listed, so this tab shows only what needs attention. `PIP_DISABLE_PIP_VERSION_CHECK=1` is set to keep pip's own nag off stdout.

The tool id is `pip` but the binary is normally `pip3`; `LOOKUP_NAMES` in `tools.ts` handles that, since a bare `pip` often doesn't exist.

## Ruby gems

`gem outdated` prints one line per stale gem:

```
CFPropertyList (2.3.6 < 4.0.0)
```

Warnings about gems whose native extensions aren't built go to **stderr**, which we don't read, so stdout is only these lines. Current gems aren't listed at all, so every row is outdated by construction — `parseGemOutdated` sets the status directly rather than comparing versions.

## Rust crates

Two steps, same shape as Go — the command lists what's installed, a registry says what's latest.

1. `cargo install --list`. Output is an unindented `name vX.Y.Z:` header per crate followed by indented binary names; `parseCargoList` reads the headers and ignores the rest, so a crate shipping several binaries stays one row.
2. Batched GET to `https://crates.io/api/v1/crates?ids[]=a&ids[]=b…`, 50 crates per request. `max_stable_version` is preferred over `max_version` so pre-releases don't produce spurious "outdated" markers; a crate that has only ever published pre-releases falls back to `max_version`.

**crates.io returns 403 without a descriptive `User-Agent`** — their crawler policy requires one that identifies the client and offers a way to make contact. `USER_AGENT` in `cargo.ts` carries the repo URL. Drop it and every lookup fails silently.

Unknown crate names are simply absent from the response rather than erroring, so a crate installed with `cargo install --git` or `--path` gets no match and reads as current. Same trade-off as Go's pseudo-versions: better to under-report than to invent an update. A batch that fails is logged and skipped, leaving other batches to land.

## JavaScript globals beyond npm

- **pnpm** — `pnpm ls -g --json` merged with `pnpm outdated -g --format=json`, so the tab shows everything installed rather than only what's stale, matching the npm source. Both exit 1 by design (`ls` on an empty global root, `outdated` whenever anything is out of date).
- **yarn** — `yarn global list` prints `info "name@version" has binaries:` lines and reports no latest, so versions come from the npm registry. Split the spec on the **last** `@` so scoped names keep their leading one. **Yarn 2+ removed global installs entirely**, so the source checks `yarn --version` first and fails with an explanation rather than surfacing yarn's own usage error.
- **bun** — `bun outdated --global` prints an ASCII table and ignores `--json` (as of bun 1.3). Rows are identified by requiring the version columns to start with a digit, which excludes both the `| Package | Current |` header and the `|-----|` rules without tracking table position. Only outdated packages appear, so every row is outdated by construction.

## Python tools (pipx, uv)

`pip` covers libraries; `pipx` and `uv` cover command-line tools, and a developer usually has one of the latter. Neither reports a latest version, so both go through `pypiLatest()` in `registry.ts`.

- **pipx** — `pipx list --json` nests each tool under its venv name; read the package name from `metadata.main_package.package` rather than the venv key, which isn't authoritative.
- **uv** — `uv tool list` looks like cargo's output but isn't: the binary lines start with `- ` rather than being indented, so the header test has to be a positive match.

PyPI's `info.version` is the latest **stable** release — django reports `6.1` while `6.1rc1` sits in the index — so prereleases don't produce spurious "outdated" markers.

## PHP (Composer)

`composer global outdated --format=json` reports installed and latest together, nested under `installed`. It **exits 1 with empty stdout when there's no global `composer.json` at all** — i.e. the user has Composer but no global packages. That's an empty tab, not an error, so exit 1 is allowed and empty output returns `[]`.

## Go binaries

Covers binaries installed via `go install <path>@...` into `$GOBIN` (falls back to `$GOPATH/bin`, then `~/go/bin`). Steps per refresh:

1. `go env GOBIN GOPATH` — resolve the install directory.
2. `readdir` that directory, then `go version -m <file1> <file2> …` on all entries in one call. The parser reads header lines (`/path/to/bin: goX.Y.Z`) and indented tab-separated `path` / `mod` lines; non-Go files produce a header with no `mod` line and are silently skipped.
3. For each distinct module, fetch `https://proxy.golang.org/<escaped-module>/@latest` in parallel (uppercase letters in the path are escaped as `!lower` per the module proxy protocol). Response is `{Version, Time}` — we only use `Version`.

`installedVersion` comes from the `mod` line (the tagged version `go install` resolved), `latestVersion` from the proxy. Missing from proxy / proxy failure → `latest = installed`, not outdated. Pseudo-versions and `(devel)` are compared as plain strings; if you `go install`'d from a local checkout the entry will likely read as outdated once any tag is cut.

`name` is the full install path (e.g. `honnef.co/go/tools/cmd/staticcheck`) so each binary is uniquely keyed; `displayName` is the short filename shown primarily in the UI.

## Settings

`~/Library/Application Support/os-inventory/settings.json`, written atomically:

```jsonc
{
  "schema": 1,
  "sources": ["homebrew-formula", "custom:cargo"], // tracked, in tab order. [] by default.
  "customSources": [ /* see below */ ],           // defined, whether tracked or not
  "toolPaths": { "go": "/opt/custom/go" },        // overrides; absent means auto-detect
  "autoRefreshMinutes": 60                        // 0 = manual only
}
```

`settings.sources` **is** the enabled set — membership means tracked, and array order is tab order. There is no separate `enabled` flag. Everything read off disk or arriving over IPC goes through `normalizeSettings()`, which drops unknown source and tool ids and clamps the interval, so a hand-edited or newer-version file can't break the app.

The settings panel (`SettingsPanel.tsx`) shows **Tracked** (reorder / remove), **Found on this machine** (add), **Custom sources**, **Tool locations**, and **Refresh**.

Sources whose CLI isn't detected are collapsed behind a "show N more that aren't installed here" toggle — the section header is *Found on this machine*, not *Available*, because a list full of "not found" reads as the app telling the user what they ought to have installed. They're still addable when expanded: detection can be wrong, and a per-source error explains the problem better than a disabled button. Only sources unsupported on the current OS can't be added.

Closing the panel triggers a refresh iff some tracked source has no `ok` result yet — which covers both "just added something" and "just fixed a broken tool path", without refreshing on a pure reorder.

## Custom sources

A user-defined source is a command plus a rule for reading its stdout:

```jsonc
{
  "id": "custom:cargo",            // always custom:<slug>; the slug is derived from the label
  "label": "Rust Crates",
  "itemNoun": "apps",              // fills "Filter apps…"
  "command": "mas",                // bare name (PATH lookup) or absolute path
  "args": ["outdated"],
  "mode": "regex",                 // regex | tsv | json
  "pattern": "^\\s*\\d+\\s+(?<name>.+?)\\s+\\((?<installed>[^\\s)]+)\\s*->\\s*(?<latest>[^)]+)\\)",
  "upgradeCommand": "mas upgrade", // optional
  "allowExitCodes": [1]            // optional; for tools that exit non-zero by design
}
```

The three modes trade generality against effort. `regex` parses a manager's native output — most have an `outdated` subcommand, which is why this covers so much. `tsv` (`name⇥installed⇥latest`) and `json` are the escape hatch: the user's own script can produce them from anything, including a registry API. `json` also accepts the common field aliases (`version`/`current_version` for installed, `latest_version`/`newest` for latest), so `pip list --outdated --format=json` and friends work with no wrapper. Parsers live in `customParse.ts` and are pure, so they're unit-tested against fixture strings.

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

- **CLI paths are resolved, not hard-coded** — `src/main/tools.ts` tries the user's Settings override, then a candidate list, then a `which` lookup. Reason GUI apps need this at all: macOS launchd starts them with a bare `PATH`, so `execFile('brew', ...)` fails when launched from Finder / Dock. Add new CLIs to `CANDIDATES` and `LOOKUP_NAMES` there, not as a constant in a source module. Both Apple Silicon (`/opt/homebrew`) and Intel (`/usr/local`) locations are listed, so one build covers either Mac.
- **The same missing-`PATH` problem also bites child processes those CLIs spawn internally.** `npm`'s global CLI is a script with a `#!/usr/bin/env node` shebang — `env` resolves `node` via the *child's* `PATH`, so even with an absolute npm path, a Finder-launched app fails with `env: node: No such file or directory`. Fixed via `src/main/childEnv.ts`, which every `execFile`/`execFileAsync` call uses instead of raw `process.env`. Use it for any new spawned process.
- **`brew update` is slow** (10–30s cold). We run it on every refresh so "latest version" is genuinely current. Don't remove it without a replacement freshness strategy.
- **No auto-update of the app itself.** Auto-*refresh* is user-configurable and defaults to hourly.
- **Signed, but not distributable.** `build:mac` does sign — `electron-builder` auto-discovers a signing identity in the keychain and currently picks up an *Apple Development* certificate. That's a development cert, not a **Developer ID Application** cert, and `notarize: false` in `electron-builder.yml` disables notarization. `spctl -a -t exec` rejects the output: it launches on the machine that built it, but Gatekeeper blocks it everywhere else. Shipping to other people needs a Developer ID cert plus notarization turned on. A clone with no identity in its keychain falls back to an unsigned bundle.
- **`HOMEBREW_NO_AUTO_UPDATE=1` is set** in the brew env to prevent spurious updates inside `brew info` calls — we control update timing explicitly.

## Adding a new source

**First check it's in scope**: a package manager for developer dependencies, not an application or OS software. If it isn't, the answer is a custom source, not a built-in.

Then check it can actually report a latest version. A command that only lists what's installed produces a tab of "unknown" rows, which is noise — that's why `pipx`, `cargo install --list` and `dotnet tool list` aren't here. Either the command reports latest itself (`gem outdated`, `pip list --outdated`), or the source queries a registry (Go's module proxy).

Three steps, no renderer changes:

1. Add the id to `BuiltInSourceId` in `src/shared/types.ts` — plus a `ToolId`, a `CANDIDATES` entry and a `LOOKUP_NAMES` entry in `src/main/tools.ts` if it shells out to a CLI the app doesn't already know.
2. Write `src/main/sources/<name>.ts` exporting a `Source` — see `source.ts` for the contract. Use `detectViaTool(id)`, `requireTool()` (throws with a message worth showing), `statusFor()`, and `ctx.note()` for sub-step progress. Keep the output parsing in a separate exported pure function so it can be tested against captured real output.
3. Append it to `BUILT_IN` in `src/main/sources/index.ts`.

It then appears in Settings automatically, and existing users are unaffected until they add it.

The mainstream language managers are covered. Remaining candidates:
- **Runtime version managers** — `mise outdated`, `asdf`. Arguably in scope (they install developer dependencies), arguably a different thing (they manage language *runtimes*). Decide before building.
- **`.NET` tools, SDKMAN** — same shape as the rest, both need their real output captured first.

## Non-goals for now

- No auto-update of the app itself, no Developer ID signing/notarization pipeline.
- No notifications when a new version becomes available.
- No tracking of individual hand-picked packages — tracking is per-source.
- No sharing or importing of custom source definitions (see the security note above).
- **No applications or OS software** — no editor plugins, Mac App Store, system updates, `/Applications` scanning or Homebrew casks. This is a deliberate boundary, not a backlog; see *What this app is for*.
- **macOS only, on purpose.** See *Platform* below.
