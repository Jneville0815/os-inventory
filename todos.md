# Remaining work

Everything left between here and a paid, downloadable product. Roughly in
dependency order — the top of each section unblocks the rest of it.

**Shipped so far:** source registry, Settings (nothing tracked by default,
detected-first), custom sources, 12 built-in package managers, 121 tests.

---

## 0. Decisions needed

These gate real work, and two of them get more expensive the longer they wait.

- [ ] **Product name.** `os-inventory` reads as a repo, not a product. It sets the
      `appId`, the DMG filename, the window title, the domain and the store
      listing — all cheap now, all painful after the first customer. *Blocks §2, §5, §6.*
- [ ] **Price, and what an upgrade costs.** Decided: one-time, version-limited
      (a 1.x licence, 2.0 is a paid upgrade). The number is still open. No code
      depends on it, but the store listing and site copy do.
- [ ] **Store: Polar or Lemon Squeezy.** Both are merchants of record, so either
      one takes on EU VAT and US sales tax. The choice only changes webhook
      signature verification in the licence issuer. *Blocks §4.*
- [ ] **Are runtime version managers in scope?** `mise` / `asdf` install developer
      dependencies (in scope by the rule) but manage language *runtimes* rather
      than packages (arguably a different thing). Decide before building, so the
      scope line in `CLAUDE.md` stays honest.

---

## 1. Start immediately — long external lead time

- [ ] **Enrol in the Apple Developer Program** ($99/yr). Enrolment can take days,
      and §5 cannot start without it. Nothing else in this file blocks on it, so
      start it and let it run in the background.

---

## 2. Before anyone else sees a build

Small, but all of it leaks into the artifact a customer downloads.

- [ ] `electron-builder.yml` — replace the scaffold defaults:
      - `appId: com.electron.app` → real reverse-DNS id (match `setAppUserModelId`
        in `src/main/index.ts`)
      - `win.executableName: os-inventory-scaffold`
      - `linux.maintainer: electronjs.org`
      - `publish.url: https://example.com/auto-updates` (superseded by §5)
      - **Delete the four `extendInfo` usage strings** — camera, microphone,
        Documents, Downloads. The app touches none of them, and asking for the
        microphone is a support ticket waiting to happen.
- [ ] `package.json` — `description` still says "Homebrew first"; `author` has no
      email; bump `version` (0.9.0 for pre-release, 1.0.0 at launch).
- [ ] **Stale UI copy** — `src/renderer/src/App.tsx:135` still offers "package
      managers and app sources"; app sources are out of scope now. The header
      subtitle "Package versions" could say what the app is for.
- [ ] **Replace the README screenshot.** `resources/screenshots/dashboard.png` is
      from 30 Jul and shows tabs that no longer exist (Brew Casks, VS Code,
      Desktop Apps).
- [ ] **Settle the Prettier mismatch.** `.prettierrc.yaml` says `semi: false`
      while the whole codebase uses semicolons — 1,493 lint warnings, 0 errors,
      and it predates this work. Either flip the config to `semi: true` (one
      line, no diff) or run `npm run format` (one noisy commit). Until then the
      warning count hides anything new.

---

## 3. Licensing (in-app)

No server involved: the app verifies offline and never phones home.

- [ ] `scripts/keygen.ts` — generate the Ed25519 keypair once. Private half into
      a password manager, **never** the repo.
- [ ] Commit the public key at `src/shared/licensePublicKey.ts`.
- [ ] Key format — one paste-safe line, whitespace stripped on verify:
      `OSINV1.<base64url(payload)>.<base64url(sig)>` where payload is
      `{ v, order, name, email, product, maxMajor, issuedAt }`.
- [ ] `src/main/license.ts` — verify via `node:crypto` (`crypto.verify(null, …)`).
      Ed25519 is built in, so **no new dependencies**. Returns
      `unlicensed | valid | invalid | covers-earlier-version`.
- [ ] Store the raw key in `settings.json`; extend `normalizeSettings()` and the
      `Settings` type.
- [ ] Settings → **Licence** pane: status, paste box, Verify, Remove, Buy link
      (opens externally via the existing `setWindowOpenHandler`).
- [ ] Unlicensed behaviour: **fully functional**, small `unregistered` chip in the
      header, dismissible purchase banner roughly every 20th launch. No launch
      modal, no countdown, no feature gates.
- [ ] Tests: valid key, tampered payload, wrong keypair, `maxMajor` lower than the
      running major (shows upgrade prompt, still runs).

> The source is public and MIT, so the public key is visible and the check is
> trivially patchable. That's Sublime Text's position too, and it's fine — this
> is an honour system backed by convenience, not DRM. **Spend no effort on
> obfuscation or tamper-checks**; they never pay back.

---

## 4. Payment infrastructure

- [ ] Create the product in the chosen store; configure the webhook.
- [ ] `license-issuer/` — a Cloudflare Worker (lives in this repo; only the key is secret):
      - [ ] `POST /webhook` — verify the store's HMAC, pull order id + name +
            email, sign, email the key. **Idempotent on order id** (KV) — stores retry.
      - [ ] `POST /reissue` — admin-token protected, re-sends a lost key. You will
            need this in week one.
      - [ ] Secrets: `LICENSE_PRIVATE_KEY`, `STORE_WEBHOOK_SECRET`,
            `RESEND_API_KEY`, `ADMIN_TOKEN`.
- [ ] `scripts/issue-license.ts` — manual issuance for comps, press, refund
      reversals, and the day the webhook breaks.
- [ ] End-to-end test in the store's sandbox: webhook → Worker → email → key
      verifies in the app. Fire the same webhook twice, confirm one email.

---

## 5. Signing, notarization, auto-update

Blocked on §1. This is what the money actually buys, so it has to be right.

- [ ] Create a **Developer ID Application** certificate. The current build picks up
      an *Apple Development* cert, which Gatekeeper rejects everywhere except the
      machine that built it.
- [ ] `electron-builder.yml`: `notarize: true`, `hardenedRuntime: true`; review
      `build/entitlements.mac.plist` — the app spawns child processes, so it needs
      what Electron requires and nothing more.
- [ ] Add `electron-updater`; set `publish: { provider: github, owner, repo }`.
      Free, and it works because the repo is public.
- [ ] "Update available → Restart to install" in the header.
- [ ] Release workflow on tag push: build → sign → notarize → staple → publish
      DMG/ZIP + `latest-mac.yml` to a GitHub Release. Secrets: base64 `.p12`, cert
      password, App Store Connect API key.
- [ ] Verify: `spctl -a -t exec -vv` prints *accepted / source=Notarized Developer
      ID*, `xcrun stapler validate` passes, and **the DMG opens on a different Mac
      that has never seen your keychain**. Then ship a patch tag and confirm the
      previous install offers the update.

---

## 6. Site and launch

- [ ] Static site (Cloudflare Pages or GitHub Pages): screenshot, download, Buy,
      changelog.
- [ ] *"Where do I put my licence key?"* page — this is the top support question
      for every app that works this way.
- [ ] **Privacy page.** The app makes outbound calls to PyPI, the npm registry,
      crates.io and the Go module proxy. Say so plainly, and say there's no
      telemetry and no licence phone-home. That's a real differentiator, not
      boilerplate.
- [ ] Launch copy built on the scope line: *see every out-of-date developer
      dependency on your Mac.*

---

## 7. Deferred

Not needed to ship; listed so they aren't rediscovered later.

- [ ] **Windows.** `winget upgrade` and `scoop status` are straightforward;
      installed programs from the `…\CurrentVersion\Uninstall` registry keys need
      real work. Code-signing there has its own identity-verification lead time —
      start it early if Windows becomes a priority.
- [ ] **Linux.** `apt list --upgradable`, `dnf check-update`, pacman, Flatpak, Snap.
- [ ] **More managers.** `.NET` tools, SDKMAN. Each needs its real output captured
      before anything is written — see the rule in `CLAUDE.md`.
- [ ] Per-source refresh instead of all-or-nothing.
- [ ] Notifications when something goes out of date.
- [ ] Pin or hide individual packages.

---

## 8. Known debt

- [ ] **The Windows fixes in `3807ffc` have never run on Windows.** The `.cmd`
      spawn fix, the `where` extension preference and the `basename` fix are all
      reasoned from documented Node behaviour, not observed. Treat Windows as
      unproven, not working.
- [ ] **No CI at all.** `npm test` runs only when someone remembers. At minimum,
      run typecheck + lint + test on push before taking money for this.
- [ ] **Nothing tests process spawning, path resolution or IPC.** Those are
      verified by running the app by hand. A packaged-build smoke test would
      catch the class of bug that only appears outside `npm run dev` — which is
      exactly where the hard-coded-path bugs lived.
- [ ] `resources/screenshots/` has one stale image; the README references it.
