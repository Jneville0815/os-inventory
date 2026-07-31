<p align="center">
  <img src="./resources/icon.png" alt="OS Inventory icon" width="128" height="128">
</p>

<h1 align="center">OS Inventory</h1>

A macOS desktop dashboard that shows what's installed on your machine next to the latest available version, so you can see at a glance what's out of date.

Covers:

- Homebrew formulae
- Homebrew casks
- npm globals
- VS Code extensions
- Go binaries (`go install`'d into `$GOBIN`)
- macOS `.app` bundles in `/Applications` (via Sparkle appcast checks)

Built with Electron, React, and TypeScript.

![OS Inventory dashboard showing the Brew Formulae tab](./resources/screenshots/dashboard.png)

## Getting started

```bash
npm install
npm run dev
```

`npm run dev` starts the app with hot module reloading for the renderer. Click **Refresh** to run the inventory checks — the first refresh may take a little while (Homebrew's `brew update` alone can take 10–30 seconds), after which a snapshot is cached to disk and reloaded instantly on next launch.

## Commands

| Command             | What it does                                                                     |
| -------------------- | --------------------------------------------------------------------------------- |
| `npm run dev`        | Starts main + renderer with HMR and opens the app window.                        |
| `npm run build`      | Full typecheck + production bundle (`out/`). No packaging.                       |
| `npm run build:mac`  | Builds and packages a `.dmg`/`.zip` for macOS via `electron-builder` (unsigned).  |
| `npm run typecheck`  | `tsc --noEmit` for both the main and renderer TypeScript configs.                 |
| `npm run lint`       | ESLint via the electron-toolkit config.                                          |
| `npm run format`     | Prettier, applied in place.                                                      |

## How it works

Each ecosystem is checked by shelling out to its native CLI (or, for macOS apps, reading `Info.plist` and querying Sparkle appcasts) and comparing the installed version against the latest available one:

- **Homebrew** — `brew update` then `brew info --json=v2 --installed`, which returns formulae and casks with their `outdated` flag already computed.
- **npm globals** — `npm ls -g --json` merged with `npm outdated -g --json`.
- **VS Code extensions** — `code --list-extensions --show-versions`, cross-checked against the public VS Code Marketplace API (filtering out pre-releases and versions that require a newer editor than the one installed).
- **Go binaries** — `go version -m` over everything in `$GOBIN`, with the latest version resolved per-module via the Go module proxy (`proxy.golang.org`).
- **macOS apps** — walks `/Applications` (plus `/Applications/Utilities` and `~/Applications`), reads each bundle's `Info.plist`, and fetches the app's Sparkle feed (`SUFeedURL`) if it has one. Apps already shown under Homebrew Casks are deduplicated out.

Results are cached to `~/Library/Application Support/os-inventory/snapshot.json` and repainted immediately on launch, so there's no blank screen while checks run. Refresh is always a manual, explicit action — nothing runs automatically or on a timer.

See [`CLAUDE.md`](./CLAUDE.md) for the full architecture breakdown, IPC contract, and per-ecosystem implementation notes.

## Requirements

- macOS (Apple Silicon paths are hard-coded to `/opt/homebrew/...`; Intel Macs and other platforms aren't supported yet)
- [Homebrew](https://brew.sh/) — required, as the app's baseline
- Node.js/npm, VS Code, and Go are each optional — their tabs simply show nothing if the corresponding CLI isn't found

## Known limitations

- Not code-signed or notarized — `npm run build:mac` produces an unsigned bundle, so Gatekeeper will complain on first launch.
- No auto-update, no auto-refresh timer, no settings UI yet.
- Mac App Store apps aren't covered (no Sparkle feed to check against).

## License

[MIT](./LICENSE)
