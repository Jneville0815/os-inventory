# Remaining work

Everything left between here and a paid, downloadable product. Roughly in
dependency order — the top of each section unblocks the rest of it.

**Shipped so far:** source registry, Settings (nothing tracked by default,
detected-first), custom sources, 12 built-in package managers, 121 tests.
**macOS only** — Windows and Linux support was removed deliberately.

**The model is settled: exactly Sublime Text.** Free, open source, fully
functional, direct download only. An unlicensed copy shows a purchase modal
after a while and is otherwise unrestricted. See *Licensing model* in
`CLAUDE.md` — including why the Mac App Store is technically closed to this app
rather than merely declined.

---

## 0. Decisions needed

Settled already: the Sublime Text model, macOS only, direct download, one-time
version-limited licence. What's left:

- [ ] **Product name.** `os-inventory` reads as a repo, not a product. It sets the
      `appId`, the DMG filename, the window title, and the domain — all cheap
      now, all painful after the first customer, because changing `appId` after
      release breaks auto-update identity. *Blocks §2, §5, §6.*
- [ ] **The price.** The shape is decided (one payment, covers all 1.x, 2.0 is a
      paid upgrade); only the number is open. No code depends on it — the site
      copy and store listing do. For reference, Sublime Text is $99 for a
      3-year-updates licence; this is a far smaller tool.
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

**This is required *because* distribution is a direct download, not despite it.**
Nothing here relates to the App Store. Three things depend on membership:

1. **A Developer ID Application certificate.** The free Apple ID tier only issues
   *Apple Development* certificates, which are for running your own builds on
   your own machines. Gatekeeper rejects them for distribution — verifiably: a
   `build:mac` output signed with the current cert gives
   `spctl -a -t exec` → `rejected`, exit 3. Developer ID certs are issued only to
   Program members.
2. **The notarization service.** A Developer ID signature alone isn't enough; the
   app must also be notarized by Apple and have the ticket stapled. Submitting
   requires membership.
3. **Auto-update.** Squirrel.Mac — what `electron-updater` uses — validates the
   code signature of each downloaded update. Without proper signing, updates fail.

Without it, a downloader gets a dialog saying Apple cannot verify the app is free
of malware, offering to move it to the Trash. Since macOS 15 the Control-click →
Open bypass is gone, so recovering means visiting System Settings → Privacy &
Security and choosing "Open Anyway" after being refused. That's a poor first
impression for something you're charging for, and the workaround is the same
instruction malware distributors give.

---

## 2. Before anyone else sees a build — DONE (`0.9.0`)

Small, but all of it leaks into the artifact a customer downloads.

- [x] `electron-builder.yml` — replace the scaffold defaults:
      - `appId: com.electron.app` → real reverse-DNS id (match `setAppUserModelId`
        in `src/main/index.ts`)
      - `win.executableName: os-inventory-scaffold`
      - `linux.maintainer: electronjs.org`
      - `publish.url: https://example.com/auto-updates` (superseded by §5)
      - **Delete the four `extendInfo` usage strings** — camera, microphone,
        Documents, Downloads. The app touches none of them, and asking for the
        microphone is a support ticket waiting to happen.
- [x] `package.json` — `description` still says "Homebrew first"; `author` has no
      email; bump `version` (0.9.0 for pre-release, 1.0.0 at launch).
- [x] **Stale UI copy** — `src/renderer/src/App.tsx:135` still offers "package
      managers and app sources"; app sources are out of scope now. The header
      subtitle "Package versions" could say what the app is for.
- [x] **Replace the README screenshot.** `resources/screenshots/dashboard.png` is
      from 30 Jul and shows tabs that no longer exist (Brew Casks, VS Code,
      Desktop Apps).
- [x] **Settled the Prettier mismatch.** Flipped `semi: true` to match the
      codebase (1,495 → 50 warnings), then formatted the remaining 50. Lint is
      now **0 problems**, so anything new is visible. Markdown is in
      `.prettierignore` — the docs are hand-formatted.
- [x] **Fixed `package.json` `homepage`**, which pointed at `github.com/jimmyneville`
      — not an account that exists. Added `repository` and `bugs` too.

---

## 3. Licensing (in-app)

No server involved: the app verifies offline and never phones home.

**Keys**

- [ ] `scripts/keygen.ts` — generate the Ed25519 keypair once. Private half into
      a password manager, **never** the repo.
- [ ] Commit the public key at `src/shared/licensePublicKey.ts`.
- [ ] Key format — one paste-safe line, whitespace stripped on verify:
      `OSINV1.<base64url(payload)>.<base64url(sig)>` where payload is
      `{ v, order, name, email, product, maxMajor, issuedAt }`.
      `maxMajor` is what makes a 1.x licence stop at 2.0.
- [ ] `src/main/license.ts` — verify via `node:crypto` (`crypto.verify(null, …)`).
      Ed25519 is built in, so **no new dependencies**. Returns
      `unlicensed | valid | invalid | covers-earlier-version`.
- [ ] Store the raw key in `settings.json`; extend `normalizeSettings()` and the
      `Settings` type.
- [ ] Tests: valid key, tampered payload, wrong keypair, `maxMajor` below the
      running major (prompts to upgrade, **still runs**).

**The prompt** — this is the Sublime behaviour, so get the feel right

- [ ] Count completed refreshes in `settings.json`. A refresh is this app's unit
      of work, the way a save is Sublime's.
- [ ] Show a modal when unlicensed: **first at ~10 refreshes, then every ~15**.
      Buttons: *Buy a licence* · *Enter licence* · *Not now*. Reuse the existing
      `.modal` styling from `SettingsPanel.tsx` rather than a native dialog.
- [ ] Never on first launch, never mid-refresh, and never more than once per
      session. Someone evaluating it should reach a useful screen before being
      asked for anything.
- [ ] `unregistered` chip in the header while unlicensed; replaced by the
      licensee's name once verified.
- [ ] Settings → **Licence** pane: status, paste box, Verify, Remove, Buy link
      (opens externally via the existing `setWindowOpenHandler`).

**What must stay true**

- [ ] No feature is ever gated, degraded or time-limited. Every source, custom
      sources included, works unlicensed forever.
- [ ] *Not now* is always available and always free. No countdown, no
      escalating frequency, no dark patterns.

> The source is public and MIT, so the public key is visible and the check is
> trivially patchable. That's Sublime Text's position too, and it sustains them.
> **Spend no effort on obfuscation or tamper-checks** — they don't work, they
> punish honest users, and they'd contradict the no-phone-home promise.

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

Blocked on §1. This is what the money actually buys, so it has to be right —
and because distribution is direct download rather than the App Store,
**notarization matters more, not less**: an un-notarized download gets "cannot
be opened because the developer cannot be verified" from Gatekeeper, and most
people stop there.

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

- [ ] Static site (Cloudflare Pages or GitHub Pages): screenshot, **direct .dmg
      download**, Buy, changelog. The download is the primary call to action —
      free and unrestricted — with Buy secondary. Selling first would misdescribe
      the deal.
- [ ] *"Where do I put my licence key?"* page — this is the top support question
      for every app that works this way.
- [ ] **Privacy page.** The app makes outbound calls to PyPI, the npm registry,
      crates.io and the Go module proxy. Say so plainly, and say there's no
      telemetry and no licence phone-home. That's a real differentiator, not
      boilerplate.
- [ ] Launch copy built on the scope line: *see every out-of-date developer
      dependency on your Mac.*
- [ ] State the licence terms in plain words, the way sublimehq does: free to
      download and evaluate, a licence is expected for continued use, one
      purchase covers 1.x.

---

## 7. Deferred

Not needed to ship; listed so they aren't rediscovered later.

- [ ] **Windows / Linux — explicitly dropped, not deferred.** All the code is gone;
      see *Platform* in `CLAUDE.md` for what was removed and how to recover it.
      Bringing either back means committing to actually running it on that OS.
- [ ] **More managers.** `.NET` tools, SDKMAN. Each needs its real output captured
      before anything is written — see the rule in `CLAUDE.md`.
- [ ] Per-source refresh instead of all-or-nothing.
- [ ] Notifications when something goes out of date.
- [ ] Pin or hide individual packages.

---

## 8. Known debt

- [x] ~~The Windows fixes have never run on Windows.~~ Resolved by deletion —
      the whole cross-platform surface is gone rather than shipping untested
      branches that look like support.
- [ ] **No CI at all.** `npm test` runs only when someone remembers. At minimum,
      run typecheck + lint + test on push before taking money for this.
- [ ] **Nothing tests process spawning, path resolution or IPC.** Those are
      verified by running the app by hand. A packaged-build smoke test would
      catch the class of bug that only appears outside `npm run dev` — which is
      exactly where the hard-coded-path bugs lived.
- [ ] `resources/screenshots/` has one stale image; the README references it.
