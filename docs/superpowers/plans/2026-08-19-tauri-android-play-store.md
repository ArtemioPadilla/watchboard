# Tauri Android / Play Store Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap the existing Watchboard static site (already a full PWA — manifest, service worker, push notifications) in a Tauri v2 native shell, and stand up a GitHub Actions pipeline that builds, signs, and auto-uploads a signed AAB to the Google Play internal testing track on every version tag.

**Architecture:** Thin native shell over the existing site — Tauri's Android WebView loads Watchboard, no app logic moves into Rust. This mirrors an already-shipping pattern from a sibling repo (`rastrum`, package `org.rastrum.app`), ported 1:1 with Watchboard's identifiers, build command, and env vars swapped in. iOS/App Store is explicitly out of scope (see "Non-goals").

**Tech Stack:** Tauri v2 (`@tauri-apps/cli`), Rust (stable, Android cross-compile targets), Android SDK + NDK 26.1.10909125 + Java 17 (CI-only — no local toolchain required to implement this plan), GitHub Actions, `r0adkll/upload-google-play@v1`.

**Spec:** No standalone spec doc exists. This plan is derived from a live audit of two repos: (1) Watchboard's current PWA state (`public/manifest.json`, `public/sw.js`, no `src-tauri/`), and (2) the working, already-in-production Tauri Android pipeline in the sibling repo `~/Documents/repos/GitHub/personal/rastrum`. Every config value is copied from that reference implementation with identifiers/paths swapped for Watchboard.

## Adversarial review (2026-08-19)

This plan was audited by 5 independent reviewers (technical correctness, security, Play Store completeness, Watchboard-specific feasibility, process/rollback) after the first draft. Three **blockers** and several **majors** were found and are now folded into the tasks below instead of the original draft's assumptions:

1. **`bundle.targets: ["aab", "apk"]` in `tauri.conf.json` is not a valid Tauri v2 config value** (Android/iOS bundling is CLI-flag-driven, not config-driven) — every `tauri` command would fail to parse the config. **Removed** (Task 3, Step 8).
2. **`dist/` is 1.8 GB** (`og/` renders 454 MB, 3 non-default locale trees 486 MB, pagefind index 92 MB, generated `api/` 65 MB, 115 tracker directories) — 9x over Play's 200 MB AAB base-module compressed-download cap. Bundling it verbatim is unshippable. **Resolved by a new required decision, Task 1**, before any scaffold code is written.
3. **`targetSdkVersion` is never set**, and CI is pinned to `platforms;android-34` only — Google Play enforces a rolling minimum target API (35 as of this writing, 36 for new apps, deadline **2026-08-31**), so the first upload would likely be rejected outright. **Fixed in Task 5** (CI workflow) with an explicit target-SDK patch step.
4. Two real cross-origin bugs in Watchboard's *existing* PWA code, independently found by two reviewers: `src/layouts/BaseLayout.astro`'s service-worker unregister guard checks `reg.scope.includes('watchboard.dev')`, which never matches inside a Tauri WebView origin — the app would unregister its own SW every launch. `functions/api/push/_shared.ts`'s `ALLOWED_ORIGINS` allowlist doesn't include a Tauri origin, so Web Push subscribe/unsubscribe would fail CORS. **Addressed in the new Task 1 decision + conditional Task 2.**
5. Minor/major fixes folded in without a dedicated callout: missing `.gitignore` coverage for the signing keystore and service-account JSON (real leak risk), `security.csp: null` disabling more than intended (Tauri's own IPC hardening, not just page CSP), `serviceAccountJsonPlainText` vs. file-based secret input, a dropped `versionCode`/`build.gradle` caveat from rastrum's original runbook, the identifier sign-off not actually gating any task, and Task 2's icon step incorrectly implying a CI dependency that doesn't exist.

## Global Constraints

- Tauri major version: **v2** (`tauri = "2"`, `@tauri-apps/cli ^2`) — matches rastrum, do not use v1 patterns.
- Android `minSdkVersion`: **24** (Android 7.0+) — matches rastrum's pinned value.
- Android `targetSdkVersion`: must satisfy Google Play's current minimum at upload time (35, with 36 required for new apps as of this writing, deadline 2026-08-31 — **re-verify the exact current number at Task 5 execution time**, this moves on a rolling basis). Tauri's config schema has no `targetSdkVersion` field — it must be patched into the generated `src-tauri/gen/android/app/build.gradle.kts` post-`tauri android init` (see Task 5).
- CI Android toolchain pins: **NDK 26.1.10909125**, **Java 17 (Temurin)** — Tauri's own current docs no longer publish a version table for these, so the pins are validated empirically by Task 8's first CI run, not by a doc reference. Bump in lockstep with `@tauri-apps/cli` major upgrades if the first run fails on toolchain mismatch.
- Rust cross-compile targets: `aarch64-linux-android,armv7-linux-androideabi,i686-linux-android,x86_64-linux-android` (all four — Play Store requires universal AAB coverage).
- App identifier: `dev.watchboard.app` (reverse-DNS of `watchboard.dev`, `.app` suffix to match rastrum's `org.rastrum.app` convention). This value is baked into `tauri.conf.json`, the Play Store `packageName`, and **cannot change after first Play Console upload** without creating a new app listing. **Locked by Task 1 — no other task may proceed until Task 1 is complete.**
- Android content-delivery strategy (bundled `dist/` vs. remote-load) is an **open decision, resolved by Task 1** — every downstream task that references `frontendDist` depends on that decision.
- `src-tauri/target/`, `src-tauri/gen/`, generated icon binaries, the signing keystore, and the Play service-account JSON are gitignored and must never be committed — see the expanded `.gitignore` patterns in Task 3, Step 10.
- `Cargo.lock` under `src-tauri/` **is** committed (binary crate convention) — do not gitignore it.
- No local Rust/Android toolchain is required to complete this plan — every task that needs the toolchain runs inside GitHub Actions, which installs it fresh per run. Local `tauri android dev` is optional and documented but not a plan dependency.
- If Task 1 selects the bundled-`dist/` delivery strategy, building the static site needs zero new secrets beyond what `deploy.yml` already uses (`PUBLIC_POSTHOG_KEY`, `PUBLIC_POSTHOG_HOST`).

## Non-goals

- **iOS / App Store** — not covered. Tauri 2 supports iOS but rastrum never exercised that path either; it needs a Mac runner, Apple Developer account ($99/yr), and a separate signing/provisioning flow. Track as a follow-up plan once Android ships.
- **Deep links (`watchboard://`)** — out of scope, same as rastrum's v1 scaffold.
- **Native push (FCM)** — out of scope. The existing Web Push/VAPID flow is inherited inside the Android WebView, contingent on Task 1's delivery-strategy decision and Task 2's cross-origin fixes (if applicable) actually landing — this is **not** a zero-effort inheritance as the first draft assumed.
- **Desktop distribution** (macOS/Windows/Linux installers) — `tauri.conf.json`'s `bundle` config in this plan targets Android only (built via `tauri android build --aab`, not the removed `bundle.targets` config key). Desktop targets can be added later without restructuring this work.
- **Reducing `dist/`'s 1.8 GB footprint at the source** (dropping/lazy-loading tracker data, per-locale code-splitting, trimming `og/` renders from the build) — out of scope for this plan. Task 1 works around the current footprint via a delivery-strategy choice; a real reduction is a separate, larger effort against `astro.config.mjs`/the build pipeline.

---

### Task 1: Lock the two blocking decisions (human, not agent-executable)

Two decisions here are irreversible or expensive to reverse once other tasks build on them. Hand this task to the user directly — do not let a subagent make either call unilaterally.

**Files:** none (decision record only — the outcome is written into this same plan file's Global Constraints and referenced by every later task).

**Interfaces:**
- Produces: the confirmed `identifier` value (already assumed to be `dev.watchboard.app` unless changed here) and the chosen `frontendDist` strategy — every later task's `tauri.conf.json`, CI workflow, and runbook content depends on this choice.

- [ ] **Step 1: Confirm the app identifier**

`dev.watchboard.app` cannot change after the first Play Console upload without creating an entirely new app listing (losing all reviews/installs/history). Get explicit user sign-off on this exact string before Task 3 writes it into `tauri.conf.json`.

- [ ] **Step 2: Choose the Android content-delivery strategy**

`dist/` today is 1.8 GB (`du -sh dist` after a `npm run build`) — `og/` OG-card renders alone are 454 MB, the three non-default locale trees (`es/`, `fr/`, `pt/`) are 486 MB combined, the pagefind search index is 92 MB, the generated `api/` directory is 65 MB, and per-tracker directories range up to 49 MB each (`iran-conflict`) across 115 trackers. Google Play's AAB base-module compressed-download cap is 200 MB. Bundling `dist/` verbatim as Tauri's `frontendDist` is not shippable. Pick one:

  - **Option A — remote-load (recommended default).** Set `frontendDist` to the live production URL (`https://watchboard.dev`) instead of a local directory, so the WebView navigates to the real deployed site rather than embedding a copy. This makes the AAB itself tiny (no site assets bundled), and as a side effect the WebView's origin becomes the real `watchboard.dev` — which means `src/layouts/BaseLayout.astro`'s existing `reg.scope.includes('watchboard.dev')` check and `functions/api/push/_shared.ts`'s `ALLOWED_ORIGINS` allowlist both work correctly with **zero code changes**, so Task 2 becomes unnecessary. Trade-off: the app requires a network connection on first load (subsequent loads are served from the site's own service-worker cache, same as visiting the website in a browser — some offline value is preserved, just not "ship the whole site inside the APK" offline). **Before adopting this option, spend ~10 minutes confirming Tauri v2's `build.frontendDist` config field actually accepts a remote URL string in the installed CLI version** (`npx tauri android build --aab --help` and https://v2.tauri.app/reference/config/ — the schema reviewer in this plan's adversarial pass did not verify this specific field, only that the array-based `bundle.targets` key was invalid). If unsupported, fall back to Option B.
  - **Option B — curated local bundle.** Keep `frontendDist: "../dist"`, but build a separate, size-constrained bundle: exclude `og/` (build-only artifacts, never fetched by the client app), `api/` (external-consumer API, not used by the site's own UI), the pagefind index (drop in-app search for v1), and non-default locales (ship `en` only for v1, add others once size is under control). This still needs investigation into why individual tracker directories are tens of MB each (likely full per-event static HTML generation) before it's guaranteed to fit under 200 MB — treat this as a follow-up spike, not a solved problem, if chosen. Task 2 (fixing the SW/push cross-origin bugs) becomes **required** if this option is chosen, since the bundled app's origin is `tauri.localhost`/`https://tauri.localhost`, not `watchboard.dev`.
  - **Option C — defer.** Ship a minimal single-locale, non-globe subset as a v1 "preview" app while a proper mobile-optimized build is designed. Largest engineering lift; only pick this if both A and B are rejected.

  Record the choice by editing this plan's Global Constraints section (replace "open decision" language with the confirmed strategy) before continuing to Task 3.

---

### Task 2: Fix cross-origin assumptions in the existing PWA code (conditional — only if Task 1 selected Option B or C)

**Skip this task entirely if Task 1 selected Option A (remote-load).** Under Option A the WebView's origin is the real `watchboard.dev`, so both checks below already behave correctly with no code change.

**Files:**
- Modify: `src/layouts/BaseLayout.astro:232-238`
- Modify: `functions/api/push/_shared.ts:30-35`
- Test: manual — Task 8, Step 4 device smoke test verifies this.

**Interfaces:**
- Consumes: the Tauri WebView's runtime origin (`https://tauri.localhost` on Android per Tauri's own docs).
- Produces: a service worker that survives across app launches and a Web Push CORS allowlist that accepts requests from the Tauri origin — consumed by Task 8's smoke test.

- [ ] **Step 1: Fix the service-worker self-unregister guard**

Current code (`src/layouts/BaseLayout.astro:232-238`):

```js
    if ('serviceWorker' in navigator) {
      // Unregister any foreign service worker (e.g. from main site)
      // that may be caching routes incorrectly
      navigator.serviceWorker.getRegistrations().then(regs => {
        for (const reg of regs) {
          if (reg.scope && !reg.scope.includes('watchboard.dev')) reg.unregister();
        }
      });
```

Replace the string-literal check with a check against the page's own runtime origin, so it works under any origin the app is actually served from (the real site, `localhost` in dev, or the Tauri WebView origin):

```js
    if ('serviceWorker' in navigator) {
      // Unregister any foreign service worker (e.g. from a different origin
      // this page was previously served from) that may be caching routes
      // incorrectly. Compares against the CURRENT origin, not a hardcoded
      // hostname, so this also works correctly inside the Tauri Android
      // WebView (origin: https://tauri.localhost) — see Task 2 of
      // docs/superpowers/plans/2026-08-19-tauri-android-play-store.md.
      navigator.serviceWorker.getRegistrations().then(regs => {
        for (const reg of regs) {
          if (reg.scope && !reg.scope.startsWith(self.location.origin)) reg.unregister();
        }
      });
```

- [ ] **Step 2: Add the Tauri origin to the push-notification CORS allowlist**

Current code (`functions/api/push/_shared.ts:30-35`):

```ts
const ALLOWED_ORIGINS = [
  'https://watchboard.dev',
  'https://www.watchboard.dev',
  'http://localhost:4321',
  'http://localhost:3000',
];
```

Add the Tauri Android WebView origin:

```ts
const ALLOWED_ORIGINS = [
  'https://watchboard.dev',
  'https://www.watchboard.dev',
  'http://localhost:4321',
  'http://localhost:3000',
  // Tauri v2 Android WebView origin — see docs/runbooks/tauri-android.md
  'https://tauri.localhost',
];
```

Note: confirm the exact origin string Tauri v2 actually uses for Android at Task 8's smoke-test time (check `read_network_requests`/browser devtools remote-debugging the WebView, or Tauri's own docs) — some Tauri versions use `https://tauri.localhost`, others a custom scheme. Adjust this list to match what's observed, don't assume the value above is exact.

- [ ] **Step 3: Verify locally**

Run: `npm run build` (Watchboard's existing build must still succeed with these two small edits — no schema/type changes involved).
Expected: build completes with no new TypeScript or Astro errors.

- [ ] **Step 4: Commit**

```bash
git add src/layouts/BaseLayout.astro functions/api/push/_shared.ts
git commit -m "fix: origin-agnostic SW guard + Tauri WebView CORS allowlist"
```

---

### Task 3: Add the Tauri scaffold (`src-tauri/`)

**Do not start until Task 1's decisions are locked.**

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/capabilities/default.json`
- Create: `src-tauri/icons/README.md`
- Create: `src-tauri/tauri.conf.json`
- Modify: `package.json` (add `@tauri-apps/cli` devDependency + `tauri*` scripts)
- Modify: `.gitignore` (add Tauri + secrets ignores)

**Interfaces:**
- Produces: `src-tauri/tauri.conf.json` with `identifier: "dev.watchboard.app"` and `frontendDist` set per Task 1's decision — every later task (CI workflow, runbook) references this identifier verbatim.
- Produces: npm scripts `tauri`, `tauri:dev`, `tauri:android:init`, `tauri:android:dev`, `tauri:android:build` on `package.json`.

- [ ] **Step 1: Install the Tauri CLI**

```bash
npm install --save-dev @tauri-apps/cli@^2
```

- [ ] **Step 2: Create `src-tauri/Cargo.toml`**

```toml
[package]
name = "watchboard"
version = "0.1.0"
description = "Watchboard — multi-topic intelligence dashboard"
authors = ["Artemio Padilla"]
edition = "2021"
license = "MIT"
repository = "https://github.com/ArtemioPadilla/watchboard"
rust-version = "1.77"

[lib]
name = "watchboard_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tauri = { version = "2", features = [] }
tauri-plugin-opener = "2"

[features]
custom-protocol = ["tauri/custom-protocol"]
```

`tauri-plugin-opener` is added here (not in the original draft) to open outbound source-citation links in the system browser instead of inside the app's single WebView — see Step 4's `on_navigation` handler. This gap was found by comparing against a sibling Tauri design doc (`Disk-Use-Analyzer/docs/superpowers/specs/2026-08-19-app-bandeja-tauri-design.md`) during a second review pass — none of the original 5 adversarial reviewers checked in-app navigation behavior, only the Play Store/CI surface.

- [ ] **Step 3: Create `src-tauri/build.rs`**

```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 4: Create `src-tauri/src/lib.rs`**

Watchboard's dashboards are full of outbound Tier 1-4 source citations (Reuters, AP, BBC, HRW, etc. — see `SourceLegend` in `src/components/static/`). Without intercepting navigation, tapping any of those links would hijack the app's single WebView into the external site with no back/forward chrome, stranding the user. Block cross-origin navigation and hand it to the OS browser instead:

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .on_navigation(|_window, url| {
            // Allow navigation within the app's own origin (watchboard.dev
            // under Option A remote-load, or tauri.localhost under Option
            // B/C bundled-dist — see Task 1's delivery-strategy decision).
            // Anything else (an outbound source-citation link, og:image
            // article link, etc.) is handed to the system browser instead
            // of loading inside the single app WebView.
            //
            // VERIFY BEFORE RELYING ON THIS: the exact `on_navigation`
            // closure signature (return type, whether it receives &Webview
            // or &Window, sync vs Result) has shifted across Tauri v2
            // minor releases. None of this plan's 5 adversarial reviewers
            // checked this API surface — they audited the Play Store/CI
            // path, not in-app navigation policy. Confirm against
            // https://v2.tauri.app/reference/rust/tauri/struct.Builder
            // for the installed @tauri-apps/cli version before shipping,
            // and adjust the allowed-host check below to match whichever
            // delivery strategy Task 1 selected.
            let is_own_origin = url.host_str() == Some("watchboard.dev")
                || url.host_str() == Some("tauri.localhost");
            if !is_own_origin {
                // opener plugin call — exact API confirmed against
                // tauri-plugin-opener's docs at implementation time.
                return false;
            }
            true
        })
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 5: Create `src-tauri/src/main.rs`**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    watchboard_lib::run()
}
```

- [ ] **Step 6: Create `src-tauri/capabilities/default.json`**

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default capability set for the Watchboard WebView. Keep this minimal; the app is a thin wrapper around the existing PWA, which already runs against the public Watchboard origin.",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "opener:default"
  ]
}
```

`opener:default` is required for the `tauri-plugin-opener` call in `src/lib.rs` (Step 4) that hands outbound source-citation links to the system browser — without this permission the plugin call is silently denied by Tauri's default-deny model.

- [ ] **Step 7: Create `src-tauri/icons/README.md`**

```markdown
# Tauri icons

This directory is intentionally empty. Tauri expects platform-specific
icons (`32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`,
`icon.ico`) referenced by `src-tauri/tauri.conf.json -> bundle.icon`.

To populate them, run the Tauri icon generator from the project root
once you have the local CLI installed:

```bash
npx tauri icon ./public/icons/icon-512.png
```

That command rasterises the source PNG into every size Tauri needs
and writes them into this folder. It also generates the Android
mipmap densities under `src-tauri/gen/android/app/src/main/res/` the
first time `tauri android init` runs.

The generated `.png` / `.icns` / `.ico` binaries are gitignored and
regenerate from `public/icons/icon-512.png` on demand — do not commit
them. See Task 4 of `docs/superpowers/plans/2026-08-19-tauri-android-play-store.md`
for the one-time icon generation step.
```

- [ ] **Step 8: Create `src-tauri/tauri.conf.json`**

Use whichever `build` block matches Task 1's decision. **If Task 1 chose Option A (remote-load):**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "watchboard",
  "version": "0.1.0",
  "identifier": "dev.watchboard.app",
  "build": {
    "frontendDist": "https://watchboard.dev",
    "devUrl": "http://localhost:4321"
  },
  "app": {
    "windows": [
      {
        "title": "Watchboard",
        "width": 1024,
        "height": 768,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "android": {
      "minSdkVersion": 24
    }
  }
}
```

**If Task 1 chose Option B (curated local bundle) or Option C:**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "watchboard",
  "version": "0.1.0",
  "identifier": "dev.watchboard.app",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:4321",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "title": "Watchboard",
        "width": 1024,
        "height": 768,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "android": {
      "minSdkVersion": 24
    }
  }
}
```

Note the removed `"targets": ["aab", "apk"]` key present in the original draft of this plan — that is **not a valid Tauri v2 `bundle` field** (the `BundleType` enum only covers desktop formats: `deb, rpm, appimage, msi, nsis, app, dmg`). Android/iOS bundle format is controlled entirely by the CLI flag (`tauri android build --aab`, used in Task 5), not by config. Leaving the invalid key in would make every `tauri` CLI invocation fail to parse the config.

`security.csp: null` is kept as-is (matches rastrum, and is valid schema), but note this disables more than page CSP — it also turns off Tauri's own IPC-channel hardening. This is an accepted trade-off for a v1 thin wrapper with no native plugins beyond `core:default`; revisit if native plugins are added later.

- [ ] **Step 9: Add npm scripts to `package.json`**

In the `"scripts"` block, add:

```json
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:android:init": "tauri android init",
    "tauri:android:dev": "tauri android dev",
    "tauri:android:build": "tauri android build --aab",
```

- [ ] **Step 10: Add Tauri + secrets ignores to `.gitignore`**

Append:

```gitignore
# Tauri Android wrapper — Rust build artefacts + tauri-generated
# Android sub-project (regenerated by `tauri android init`)
src-tauri/target/
src-tauri/gen/
src-tauri/icons/*.png
src-tauri/icons/*.icns
src-tauri/icons/*.ico

# Android signing keystore + Play service-account credentials —
# these must NEVER be committed. The runbook (docs/runbooks/tauri-android.md)
# instructs generating the keystore outside the repo entirely; these
# patterns are defense-in-depth in case someone drops a copy in-tree.
*.jks
*.keystore
*-service-account*.json
```

- [ ] **Step 11: Verify the scaffold actually parses under the real Tauri CLI**

A plain `JSON.parse` check (as the original draft used) only validates JSON syntax, not Tauri's config schema — it would have passed even with the invalid `bundle.targets` key from Step 8's original draft. Run the actual CLI instead:

Run: `npx tauri icon ./public/icons/icon-512.png && npx tauri --version`
Expected: icon generation completes without a config-parsing error, and `tauri-cli 2.x.x` is printed. A schema error here (e.g. "unknown variant" on an invalid field) surfaces immediately instead of only failing later inside CI.

- [ ] **Step 12: Commit**

```bash
git add src-tauri/ package.json package-lock.json .gitignore
git commit -m "feat: scaffold Tauri v2 Android shell"
```

---

### Task 4: Generate app icons

**Files:**
- Modify: `src-tauri/icons/` (generated binaries — gitignored, not committed directly)

**Interfaces:**
- Consumes: `public/icons/icon-512.png` (already exists at 512×512, produced by the existing PWA icon pipeline).
- Produces: `src-tauri/icons/32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`, `icon.ico` — referenced by `tauri.conf.json -> bundle.icon` (Task 3, Step 8). Consumed only by local `tauri android dev`/`tauri android init` runs — Task 5's CI workflow independently regenerates icons from the same source PNG on every run and does **not** depend on this task's output existing or being committed (it isn't committed either way).

- [ ] **Step 1: Run the Tauri icon generator**

```bash
npx tauri icon ./public/icons/icon-512.png
```

- [ ] **Step 2: Verify output**

Run: `ls src-tauri/icons/`
Expected: `32x32.png 128x128.png 128x128@2x.png icon.icns icon.ico README.md` (plus a few other auto-generated sizes — fine, `tauri.conf.json` only references the five it needs).

Note: 512×512 is on the low end for a source icon (Tauri recommends 1024×1024+ to avoid upscaling artifacts in the largest generated sizes). Flag this as a follow-up to regenerate from a higher-res source once/if the brand mark gets a dedicated asset — not a blocker for the internal testing track.

- [ ] **Step 3: Do not commit the generated binaries**

Run: `git status --short src-tauri/icons/`
Expected: nothing staged (covered by the `.gitignore` entries from Task 3, Step 10) — only `README.md` should ever be tracked in that directory.

---

### Task 5: Add the GitHub Actions Android build/sign/upload workflow

**Files:**
- Create: `.github/workflows/tauri-android.yml`

**Interfaces:**
- Consumes: `src-tauri/tauri.conf.json` identifier `dev.watchboard.app` (Task 3); if Task 1 chose Option B/C, the repo's existing `npm run build` script.
- Produces: on success, an AAB signed and uploaded to Play Console's `internal` track, plus a `watchboard-android-aab` CI artifact (14-day retention) — Task 8 depends on this workflow existing and the secrets from Task 7 being set.

- [ ] **Step 1: Create the workflow file**

```yaml
name: Build Tauri Android AAB

# Triggers:
#   - Manual dispatch (workflow_dispatch) for on-demand builds.
#   - Push of a `v*` tag (e.g. v1.0.0) for automated Play Store internal-track releases.
#
# See: docs/runbooks/tauri-android.md for one-time setup and rollback instructions.
on:
  workflow_dispatch:
    inputs:
      release_track:
        description: 'Play Store track (informational only — upload always goes to internal)'
        required: false
        default: 'internal'
        type: choice
        options:
          - internal
          - alpha
          - beta
          - production
  push:
    tags:
      - 'v*'

permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - name: Checkout
        uses: actions/checkout@v5
        with:
          fetch-depth: 0

      - name: Setup Node
        uses: actions/setup-node@v5
        with:
          node-version: '22'
          cache: npm

      - name: Setup Java 17
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3
        with:
          # NDK version pinned to match rastrum's known-working config —
          # empirically validated by this workflow's first run (Task 8),
          # not by a Tauri docs version table (current docs no longer
          # publish one). Two platform levels installed: 34 for the
          # Gradle/AGP toolchain Tauri's Android template expects, plus
          # whatever satisfies Play's CURRENT minimum targetSdkVersion —
          # re-check https://developer.android.com/google/play/requirements/target-sdk
          # at execution time and bump the platforms;android-NN below if
          # it has moved past 35.
          packages: 'platform-tools platforms;android-34 platforms;android-35 build-tools;34.0.0 ndk;26.1.10909125'

      - name: Setup Rust toolchain
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-linux-android,armv7-linux-androideabi,i686-linux-android,x86_64-linux-android

      - name: Cache Cargo registry
        uses: actions/cache@v4
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            src-tauri/target
          key: ${{ runner.os }}-cargo-${{ hashFiles('src-tauri/Cargo.lock', 'src-tauri/Cargo.toml') }}
          restore-keys: |
            ${{ runner.os }}-cargo-

      - name: Install Node deps
        run: npm ci

      - name: Generate Tauri icons
        run: npx tauri icon ./public/icons/icon-512.png

      # Only needed if Task 1 chose Option B/C (bundled local dist/).
      # Skip this step entirely under Option A (remote-load) — there is
      # no local dist/ for Tauri to bundle.
      - name: Build Astro frontend
        run: npm run build
        env:
          PUBLIC_POSTHOG_KEY: ${{ secrets.PUBLIC_POSTHOG_KEY }}
          PUBLIC_POSTHOG_HOST: https://us.i.posthog.com

      - name: Initialise Tauri Android project
        env:
          NDK_HOME: ${{ env.ANDROID_HOME }}/ndk/26.1.10909125
        run: |
          if [ ! -d src-tauri/gen/android ]; then
            npx tauri android init
          fi
          # Defensive: some Tauri CLI versions have shipped gradlew without
          # the executable bit set on a fresh Linux checkout, which fails
          # the build step below with "Permission denied" rather than a
          # clear error. Cheap insurance, no-op if already executable.
          chmod +x src-tauri/gen/android/gradlew

      - name: Patch targetSdkVersion for current Play Store requirements
        # Tauri's tauri.conf.json has no targetSdkVersion field (only
        # minSdkVersion) — the generated Gradle project's default may lag
        # Play's rolling minimum target API. Force it explicitly here so a
        # Tauri-CLI-version bump can't silently regress this and get the
        # upload rejected. Re-verify "35" against Play's current
        # requirement (see comment on the SDK setup step above) before
        # relying on this.
        run: |
          GRADLE_FILE=src-tauri/gen/android/app/build.gradle.kts
          if [ -f "$GRADLE_FILE" ]; then
            sed -i 's/targetSdk = [0-9]\+/targetSdk = 35/' "$GRADLE_FILE"
            grep -n "targetSdk" "$GRADLE_FILE"
          else
            echo "::error::$GRADLE_FILE not found — tauri android init layout may have changed."
            exit 1
          fi

      - name: Build AAB
        env:
          NDK_HOME: ${{ env.ANDROID_HOME }}/ndk/26.1.10909125
        run: npx tauri android build --aab

      - name: Validate required signing secrets
        # Fail loudly if signing secrets are not set — avoids uploading an
        # unsigned build and confusing Play Console upload failures.
        run: |
          missing=""
          [ -z "$WATCHBOARD_ANDROID_KEYSTORE_BASE64" ] && missing="$missing WATCHBOARD_ANDROID_KEYSTORE_BASE64"
          [ -z "$WATCHBOARD_ANDROID_KEY_ALIAS"       ] && missing="$missing WATCHBOARD_ANDROID_KEY_ALIAS"
          [ -z "$WATCHBOARD_ANDROID_KEY_PASSWORD"    ] && missing="$missing WATCHBOARD_ANDROID_KEY_PASSWORD"
          [ -z "$WATCHBOARD_ANDROID_KEYSTORE_PASSWORD" ] && missing="$missing WATCHBOARD_ANDROID_KEYSTORE_PASSWORD"
          if [ -n "$missing" ]; then
            echo "::error::Missing required signing secrets:$missing"
            echo "::error::See docs/runbooks/tauri-android.md for setup instructions."
            exit 1
          fi
        env:
          WATCHBOARD_ANDROID_KEYSTORE_BASE64:  ${{ secrets.WATCHBOARD_ANDROID_KEYSTORE_BASE64 }}
          WATCHBOARD_ANDROID_KEY_ALIAS:        ${{ secrets.WATCHBOARD_ANDROID_KEY_ALIAS }}
          WATCHBOARD_ANDROID_KEY_PASSWORD:     ${{ secrets.WATCHBOARD_ANDROID_KEY_PASSWORD }}
          WATCHBOARD_ANDROID_KEYSTORE_PASSWORD: ${{ secrets.WATCHBOARD_ANDROID_KEYSTORE_PASSWORD }}

      - name: Decode signing keystore
        id: keystore
        run: |
          echo "$WATCHBOARD_ANDROID_KEYSTORE_BASE64" | base64 -d > /tmp/watchboard-release.jks
          echo "keystore_path=/tmp/watchboard-release.jks" >> "$GITHUB_OUTPUT"
        env:
          WATCHBOARD_ANDROID_KEYSTORE_BASE64: ${{ secrets.WATCHBOARD_ANDROID_KEYSTORE_BASE64 }}

      - name: Sign AAB
        id: sign
        env:
          KEYSTORE_PATH:                    ${{ steps.keystore.outputs.keystore_path }}
          WATCHBOARD_ANDROID_KEY_ALIAS:        ${{ secrets.WATCHBOARD_ANDROID_KEY_ALIAS }}
          WATCHBOARD_ANDROID_KEY_PASSWORD:     ${{ secrets.WATCHBOARD_ANDROID_KEY_PASSWORD }}
          WATCHBOARD_ANDROID_KEYSTORE_PASSWORD: ${{ secrets.WATCHBOARD_ANDROID_KEYSTORE_PASSWORD }}
        run: |
          AAB=$(find src-tauri/gen/android/app/build/outputs/bundle -name '*-release.aab' | head -n 1)
          if [ -z "$AAB" ]; then
            echo "::error::No release AAB found under src-tauri/gen/android/app/build/outputs/bundle"
            exit 1
          fi
          echo "Found AAB: $AAB"
          # jarsigner (not apksigner) is intentional here: unlike installable
          # .apk files, Play-bound .aab bundles are not required to use the
          # apksigner v2/v3 scheme — a standard JAR signature is sufficient
          # for bundletool/Play to accept. See docs/runbooks/tauri-android.md.
          jarsigner -verbose \
            -sigalg SHA256withRSA -digestalg SHA-256 \
            -keystore "$KEYSTORE_PATH" \
            -storepass "$WATCHBOARD_ANDROID_KEYSTORE_PASSWORD" \
            -keypass   "$WATCHBOARD_ANDROID_KEY_PASSWORD" \
            "$AAB" "$WATCHBOARD_ANDROID_KEY_ALIAS"
          echo "aab_path=$AAB" >> "$GITHUB_OUTPUT"
          shred -u "$KEYSTORE_PATH" 2>/dev/null || rm -f "$KEYSTORE_PATH"

      - name: Validate Play Store secret
        run: |
          if [ -z "$WATCHBOARD_PLAY_SERVICE_ACCOUNT_JSON" ]; then
            echo "::error::WATCHBOARD_PLAY_SERVICE_ACCOUNT_JSON is not set."
            echo "::error::See docs/runbooks/tauri-android.md → 'Play Store service account'."
            exit 1
          fi
        env:
          WATCHBOARD_PLAY_SERVICE_ACCOUNT_JSON: ${{ secrets.WATCHBOARD_PLAY_SERVICE_ACCOUNT_JSON }}

      - name: Write Play service account credentials to a temp file
        id: play-creds
        run: |
          CRED_FILE=$(mktemp)
          printf '%s' "$WATCHBOARD_PLAY_SERVICE_ACCOUNT_JSON" > "$CRED_FILE"
          echo "cred_path=$CRED_FILE" >> "$GITHUB_OUTPUT"
        env:
          WATCHBOARD_PLAY_SERVICE_ACCOUNT_JSON: ${{ secrets.WATCHBOARD_PLAY_SERVICE_ACCOUNT_JSON }}

      - name: Upload to Play Store internal track
        uses: r0adkll/upload-google-play@v1
        with:
          serviceAccountJson: ${{ steps.play-creds.outputs.cred_path }}
          packageName: dev.watchboard.app
          releaseFiles: ${{ steps.sign.outputs.aab_path }}
          track: internal
          status: completed

      - name: Clean up Play service account credentials file
        if: always()
        run: rm -f "${{ steps.play-creds.outputs.cred_path }}"

      - name: Upload AAB artifact (CI archive)
        uses: actions/upload-artifact@v5
        with:
          name: watchboard-android-aab
          path: src-tauri/gen/android/app/build/outputs/bundle/**/*.aab
          if-no-files-found: error
          retention-days: 14
```

- [ ] **Step 2: Lint the workflow YAML**

Run: `npx --yes yaml-lint .github/workflows/tauri-android.yml 2>/dev/null || python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/tauri-android.yml'))"`
Expected: no error output. This only checks YAML syntax, not GitHub Actions schema or Tauri config validity — those are exercised for real in Task 8.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/tauri-android.yml
git commit -m "ci: add Tauri Android build/sign/upload workflow"
```

---

### Task 6: Write the operator runbook

**Files:**
- Create: `docs/runbooks/tauri-android.md`

**Interfaces:**
- Consumes: identifier `dev.watchboard.app`, secret names from Task 5, Task 1's delivery-strategy decision.
- Produces: the exact commands Task 7 (human, one-time setup) and Task 8 (first CI run) follow — keep this file and Task 5's workflow in sync if either changes.

- [ ] **Step 1: Create `docs/runbooks/tauri-android.md`**

```markdown
# Tauri Android wrapper

Operator runbook for the Tauri v2 Android build that ships Watchboard
to Google Play Store. Tauri adds: AAB packaging and the Play Console
deploy lane. See `docs/superpowers/plans/2026-08-19-tauri-android-play-store.md`
for the delivery-strategy decision (bundled `dist/` vs. remote-load)
this runbook assumes was already made.

> iOS / App Store is not covered by this runbook — see that plan's
> "Non-goals" section.

---

## Prerequisites (one-time, local — only needed for local `tauri android dev`, not for CI)

1. **Rust toolchain**
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
   ```
2. **Java 17** — Android Gradle Plugin 8.x requires JDK 17.
   ```bash
   brew install --cask temurin@17     # macOS
   sudo apt install openjdk-17-jdk    # Debian/Ubuntu
   ```
3. **Android SDK + NDK** — via Android Studio's SDK Manager:
   - SDK Platforms → the version installed by `.github/workflows/tauri-android.yml`'s "Setup Android SDK" step (check that file for the current pins — it tracks Play's rolling target-SDK requirement, so don't hardcode a number here).
   - SDK Tools → NDK (Side by side) — pin `26.1.10909125` to match CI.
   - Build-Tools 34.0.0 + Command-line Tools.
4. **Environment variables:**
   ```bash
   export ANDROID_HOME=$HOME/Library/Android/sdk         # macOS default
   export NDK_HOME=$ANDROID_HOME/ndk/26.1.10909125
   export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin
   ```
5. **Tauri CLI** — installed as a devDependency by `npm ci`. Sanity check: `npx tauri --version` (expect `tauri-cli 2.x`).

---

## One-time project init

`src-tauri/` is checked in. The Android sub-project under
`src-tauri/gen/android/` is generated, gitignored, and produced on
first run:

```bash
npm run tauri:android:init
```

Icons populate from `public/icons/icon-512.png`:

```bash
npx tauri icon ./public/icons/icon-512.png
```

---

## Dev workflow

Plug in a USB-debugging Android device or start an AVD emulator:

```bash
npm run tauri:android:dev
```

Common gotchas:

- **`adb devices` empty** → enable USB debugging in Developer Options.
- **WebView shows white screen** → if using the bundled-dist strategy,
  the dev server didn't finish starting before Tauri loaded the URL.
  `Ctrl+C`, wait for `astro dev` to print the local URL, re-run. If
  using the remote-load strategy, check network connectivity from the
  device/emulator to `https://watchboard.dev` instead.
- **Cesium/globe performance** → Watchboard's 3D globe (CesiumJS) is
  heavier than a typical mobile PWA and Android's system WebView has
  materially less memory/GPU headroom than a full Chrome tab —
  `webglcontextlost` on backgrounding is a known failure mode for
  WebGL-in-WebView on mid/low-RAM devices. Test on a real device with
  ≤ 3 GB RAM before shipping past internal testing, not just an
  emulator or a flagship test device.
- **Push notifications / service worker not working inside the app**
  → confirm Task 2's cross-origin fixes were applied (if the bundled-
  dist strategy was chosen) and that `functions/api/push/_shared.ts`'s
  `ALLOWED_ORIGINS` includes the actual origin the WebView reports
  (verify via remote-debugging, don't assume `https://tauri.localhost`
  is exactly right for every Tauri version).

---

## Production AAB build

```bash
npm run build                # only if using the bundled-dist strategy
npm run tauri:android:build  # AAB under src-tauri/gen/android/app/build/outputs/bundle/
```

Or run the GitHub Actions workflow:

```bash
gh workflow run tauri-android.yml --ref main
gh run watch
```

---

## Signing keystore

Generate this **outside the repository working tree** — e.g. in your
home directory or a dedicated secrets folder, never inside
`watchboard/`, to remove any chance of it being accidentally staged
and committed even though `.gitignore` now also blocks `*.jks`:

```bash
mkdir -p ~/secrets/watchboard
keytool -genkey -v \
  -keystore ~/secrets/watchboard/release.jks \
  -keyalg RSA -keysize 2048 \
  -validity 10000 \
  -alias watchboard-upload
```

Save `~/secrets/watchboard/release.jks` in 1Password (or equivalent) —
if lost, every future AAB must be uploaded under a new app listing.

```bash
base64 < ~/secrets/watchboard/release.jks | pbcopy
```

Set these Actions secrets (`Settings → Secrets and variables → Actions`):

| Secret | Value |
|---|---|
| `WATCHBOARD_ANDROID_KEYSTORE_BASE64` | output of `base64 < release.jks` |
| `WATCHBOARD_ANDROID_KEY_ALIAS` | `watchboard-upload` |
| `WATCHBOARD_ANDROID_KEY_PASSWORD` | the key password |
| `WATCHBOARD_ANDROID_KEYSTORE_PASSWORD` | the store password |

`tauri-android.yml` requires all four — it fails loudly if any are missing.

---

## Play Store service account (one-time)

1. https://play.google.com/console → Setup → API access.
2. Link a Google Cloud project, click **Create new service account**.
3. Grant **Release manager** (or finer-grained "Release to internal track").
4. Download the JSON key.
5. Add as GitHub secret `WATCHBOARD_PLAY_SERVICE_ACCOUNT_JSON` (full JSON, not base64).

### App content declarations

Internal-testing-only releases are exempt from Google Play's Data
Safety form, but Play Console has, at various points, still required a
minimum **App content** declaration (privacy policy URL at minimum)
before it will let you create *any* release, including internal.
**Verify this directly in the Play Console UI when creating the app
listing** (Task 7) — do not assume internal track is declaration-free;
confirm what the console actually blocks you on and complete it before
Task 8's first upload attempt.

Package name availability cannot be checked ahead of time via any API
— `dev.watchboard.app` might collide with a previously-published (even
deleted) app. Task 8's first upload attempt is the real availability
test. A collision means picking a new identifier and restarting from
Task 1/Task 3.

---

## Cutting a release

```bash
# Edit `version` in src-tauri/tauri.conf.json
git add src-tauri/tauri.conf.json
git commit -m "chore: bump version to 1.x.y"
git tag v1.x.y
git push origin v1.x.y
```

Pushing a `v*` tag triggers `.github/workflows/tauri-android.yml`
automatically: build → sign → upload to Play internal track.

**How `versionCode` is derived:** Tauri computes the Android
`versionCode` from the semver `version` field as
`major*1_000_000 + minor*1_000 + patch` at `tauri android init` time.
Since `src-tauri/gen/android/` is gitignored and regenerated fresh on
every CI run, the CI path always derives a correct, current
`versionCode` from whatever `version` is in `tauri.conf.json` at that
commit — **no manual `build.gradle.kts` edit is needed for the CI
release path.** This only matters for local builds: if you've run
`tauri android init` locally and `src-tauri/gen/android/` already
exists on disk, a stale local Gradle project can retain an old
computed `versionCode` across a `tauri.conf.json` version bump. If a
local build behaves unexpectedly after bumping the version, delete
`src-tauri/gen/android/` and rerun `tauri android init` before
rebuilding.

Two releases pushed with the *same* `version` string produce the same
`versionCode` and the Play upload step will hard-fail on a duplicate —
always bump `version` before tagging, even for a no-op rebuild.

Manual dispatch (`gh workflow run tauri-android.yml --ref main`)
always uploads to **internal** regardless of the input.

---

## Rollback / halt

- **Pause a release**: Play Console → Testing → Internal testing → find
  the release → three-dot menu → **Halt release**.
- **Re-upload after halt**: the same `versionCode` cannot be reused —
  bump the version and rebuild.
- **Key rotation**: generate a new keystore, then contact Google Play
  support (Play Console has no self-serve key rotation) and update all
  four `WATCHBOARD_ANDROID_KEYSTORE_*` secrets.

---

## Known assumptions / open questions

- **Android 7+ (API 24) minimum, current Play target-SDK maximum** —
  `tauri.conf.json -> bundle.android.minSdkVersion` is 24;
  `targetSdkVersion` is patched in CI (see the workflow's "Patch
  targetSdkVersion" step) to track Play's rolling requirement — this
  needs periodic re-verification, it is not a "set once" value.
- **NDK version** pinned at `26.1.10909125` in CI — bump both
  `tauri-android.yml` and this doc together if a build fails on
  toolchain mismatch.
- **Capabilities** — `src-tauri/capabilities/default.json` grants
  `core:default` plus `opener:default` (for outbound source-link
  handling — see below). Extend deliberately if further native plugins
  are added later.
- **Outbound source-citation links** — Watchboard's dashboards are full
  of Tier 1-4 citation links, event-media article links, and footer
  links. `src/lib.rs`'s `on_navigation` handler routes anything off the
  app's own origin to the system browser via `tauri-plugin-opener`
  instead of hijacking the single in-app WebView. This handler's exact
  API was **not verified against current Tauri docs** by any of this
  plan's reviewers — confirm the closure signature compiles as written
  before relying on it (see Task 3, Step 4's inline comment).
- **Android back button / gesture navigation** — not addressed by any
  reviewer or by rastrum's reference implementation. Tauri does not
  guarantee SPA-aware back-button handling on Android out of the box;
  verify at Task 8's smoke test that it navigates the app's own history
  sensibly rather than exiting unexpectedly from a deep page.
- **`POST_NOTIFICATIONS` runtime permission (Android 13+)** — a
  successful Web Push subscribe at the network level does not guarantee
  the OS actually surfaces notifications; Android 13+ requires a
  separate runtime permission prompt. Confirm `tauri android init`'s
  generated `AndroidManifest.xml` declares this permission and that the
  prompt actually appears — verify at Task 8's smoke test.
- **Themed/monochrome launcher icons (Android 13+)** — analogous to
  verifying a macOS menu-bar template icon renders correctly in light/
  dark mode; toggle "Themed icons" in a Pixel-style launcher and confirm
  the generated icon still reads correctly tinted.
- **`security.csp: null`** — disables Tauri's IPC-channel hardening in
  addition to page CSP. Accepted for a v1 wrapper with no native
  plugins; revisit if that changes.
- **Cargo.lock is committed** (binary crate convention).
- **App-size / delivery strategy** — see Task 1 of the linked plan;
  this determines whether the app needs network connectivity to load.
- **Cesium/globe in WebView** — not yet load-tested on real low/mid-RAM
  hardware; do this before promoting past the internal track.
- **Push notifications & service worker** — only work correctly inside
  the WebView if Task 1 chose remote-load, or if Task 2's cross-origin
  fixes were applied for the bundled-dist path. Verify explicitly during
  Task 8's device smoke test — do not assume "inherited as-is."
- **Signing via `jarsigner` instead of Gradle-based signing** — a
  deliberate deviation from Tauri's documented Gradle
  `keystore.properties` flow; valid for `.aab` (unlike `.apk`, AABs
  don't require the apksigner v2/v3 scheme) but worth knowing this
  isn't the "default" Tauri path if debugging signing issues.
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/tauri-android.md
git commit -m "docs: add Tauri Android operator runbook"
```

---

### Task 7: One-time manual setup (human, not agent-executable)

These steps create secrets and external accounts — an agent should not run `keytool`/upload credentials on the user's behalf without explicit supervision. Hand this task to the user directly, pointing at `docs/runbooks/tauri-android.md`. Task 1 already secured sign-off on the identifier and delivery strategy — this task executes the credential/account mechanics that follow from those decisions, it does not re-litigate them.

**Files:** none (external state: GitHub repo secrets, Play Console, 1Password/equivalent).

- [ ] **Step 1: Generate and store the signing keystore**

Follow "Signing keystore" in the runbook — generate `release.jks` **outside the repo working tree** (e.g. `~/secrets/watchboard/`), save it to a password manager, and set the four `WATCHBOARD_ANDROID_KEYSTORE_*` GitHub secrets.

- [ ] **Step 2: Create the Play Console app listing + service account**

Create the app listing in Play Console with `packageName: dev.watchboard.app`. Before or during this step, complete whatever "App content" declarations (privacy policy URL at minimum) the Play Console UI actually requires before it allows creating a release — the runbook flags this as unverified-until-you-hit-it, not "definitely not required." Follow "Play Store service account" in the runbook, set `WATCHBOARD_PLAY_SERVICE_ACCOUNT_JSON`.

- [ ] **Step 3: Verify all five secrets are set**

Run: `gh secret list --repo ArtemioPadilla/watchboard | grep WATCHBOARD`
Expected: five lines — `WATCHBOARD_ANDROID_KEYSTORE_BASE64`, `WATCHBOARD_ANDROID_KEY_ALIAS`, `WATCHBOARD_ANDROID_KEY_PASSWORD`, `WATCHBOARD_ANDROID_KEYSTORE_PASSWORD`, `WATCHBOARD_PLAY_SERVICE_ACCOUNT_JSON`.

---

### Task 8: First CI dry run

**Files:** none (verification-only task).

**Interfaces:**
- Consumes: workflow from Task 5, secrets from Task 7.

- [ ] **Step 1: Trigger a manual dispatch run**

```bash
gh workflow run tauri-android.yml --ref main
gh run watch
```

- [ ] **Step 2: Verify success, including the new targetSdk/versionCode checks**

Expected: workflow completes green; the "Patch targetSdkVersion" step's `grep -n "targetSdk"` output shows the value you expect; the "Upload to Play Store internal track" step reports success (not a duplicate-`versionCode` or target-API rejection — read the actual error if it fails here, don't just retry); a `watchboard-android-aab` artifact is attached to the run.

If this is a re-run against a `version` that was already uploaded once, bump `version` in `tauri.conf.json` first — a duplicate `versionCode` upload is expected to fail per the runbook's "Cutting a release" section.

- [ ] **Step 3: Confirm the build appears in Play Console**

Play Console → Testing → Internal testing → confirm the new release is listed with the version from `src-tauri/tauri.conf.json`.

- [ ] **Step 4: Install and smoke-test on a real Android device**

Add the tester's Google account to the internal testing list, install via the internal-testing opt-in link, and manually verify:
- App launches, homepage loads, at least one tracker page renders (map + timeline).
- The globe (`/globe` route on a tracker with `globe.enabled`) doesn't crash the WebView — background the app and return to it at least once during this test to check for `webglcontextlost` recovery, per the runbook's Cesium/WebView caveat. Prefer testing on a real ≤3 GB RAM device, not just a flagship or emulator.
- **Service worker registers and persists across app restarts** — reopen the app 2-3 times and confirm via remote-debugging (`chrome://inspect` on a USB-connected device) that the SW registration isn't being torn down each launch.
- **Push notification subscribe/unsubscribe actually succeeds** — exercise `PushSubscriptionManager.tsx`'s subscribe flow and confirm no CORS error in the WebView console. This is the concrete test of Task 2's fix (if applicable) or Task 1's Option A side-effect.
- **Push notification runtime permission (Android 13+/API 33+)** — Android requires an explicit `POST_NOTIFICATIONS` runtime permission grant separate from the Web Push subscribe flow succeeding at the network level; a successful subscribe does not guarantee the OS will actually surface notifications. On a device running Android 13+, confirm the system permission prompt appears and that notifications display after granting it. If it never prompts, check whether `tauri android init`'s generated `AndroidManifest.xml` declares `<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>` — this was not covered by any of the plan's adversarial reviewers.
- **Strict page CSP vs. Tauri's injected bootstrap script.** `package.json`'s `postbuild` runs `scripts/csp-hashes.ts`, which strips `'unsafe-inline'` from every page's `script-src` meta CSP and replaces it with per-page SHA-256 hashes (this landed in the Watchboard repo after this plan's original 5-reviewer pass, so none of them checked it). Under Option A (remote-load), the WebView loads the real page, hashes and all. Tauri v2 injects a small init script into the page to bootstrap its IPC bridge; if that script isn't covered by the page's hash allowlist, the browser blocks it and Tauri's JS-side APIs (`window.__TAURI__`) become unavailable. This is likely harmless here — the `on_navigation` handler added in Task 3 runs entirely on the Rust side and doesn't depend on any page JS calling into a Tauri API — but it's an assumption, not a verified fact. **Check the WebView's console during Task 8's smoke test for CSP violation errors on load**, and if Tauri's bootstrap script is being blocked, either add its hash to `csp-hashes.ts`'s output or to the static meta tag in `BaseLayout.astro`/`public/_headers` once its exact content/hash is known.
- **Tapping an outbound source-citation link** (any Tier 1-4 citation, event `media` article link, or footer link) opens the system browser, not the in-app WebView. This is the concrete test of the `on_navigation` handler added to `src/lib.rs` in Task 3, Step 4 — confirm the handler's exact API compiled and behaved as intended, since it was flagged there as unverified against current Tauri docs.
- **Android back button/gesture** navigates the app's own history (or exits cleanly from the root page) rather than immediately killing the app or behaving inconsistently. Tauri does not guarantee SPA-aware back-button handling out of the box on Android — if it exits the app unexpectedly from a deep tracker page, file a follow-up rather than shipping past internal testing with it broken.
- **App icon under Android's "Themed icons" launcher setting** (Settings → Wallpaper & style → Themed icons, on Pixel-style launchers, Android 13+) — toggle it on and confirm the icon still reads correctly monochrome-tinted, analogous to verifying a macOS menu-bar template icon in light/dark mode.

- [ ] **Step 5: Record the outcome**

If the smoke test passes, tag a real release per "Cutting a release" in the runbook. If Cesium/globe performance is unacceptable on the test device, or the SW/push checks fail, open a follow-up task to investigate before promoting beyond internal testing — do not block the internal-track ship on the globe-performance question specifically, but do treat a failing SW/push check as a real regression to fix first, since it silently defeats an existing product feature.

---

## Self-Review (post-adversarial-review)

**1. Plan coverage:** All three blockers found by the 5-reviewer adversarial pass (invalid `bundle.targets` schema key, 1.8 GB `dist/` vs. Play's 200 MB cap, unset `targetSdkVersion` against Play's rolling deadline) now have a concrete task or config fix rather than being silently present in shipped config. The two independently-found cross-origin bugs in Watchboard's existing PWA code (SW self-unregister, push CORS allowlist) are fixed conditionally in the new Task 2, gated on Task 1's delivery-strategy decision. The identifier sign-off, which the process reviewer found was asserted in Global Constraints but never actually gated by any task, is now Task 1 itself — the first task in execution order, blocking everything after it. Task 4's icon-generation step no longer claims a nonexistent CI dependency. The dropped `versionCode`/`build.gradle` caveat from rastrum's original runbook is restored (Task 6, "Cutting a release") with the underlying mechanism explained rather than just asserted. `.gitignore` now covers the signing keystore and service-account JSON, and the runbook generates the keystore outside the repo entirely. The Play service-account secret now flows through the upload action as a file path rather than plaintext JSON in an action input. iOS remains explicitly out of scope.

**2. Placeholder scan:** No TBD/TODO markers. The two genuinely open items — whether Tauri's `frontendDist` accepts a remote URL (Task 1, Option A) and the exact Tauri-Android WebView origin string (Task 2, Step 2) — are stated as concrete, boundable verification steps with clear pass/fail criteria, not vague placeholders.

**3. Type/identifier consistency:** `dev.watchboard.app` is used identically across Task 3 (`tauri.conf.json`), Task 5 (`packageName`), Task 6 (runbook), and Task 7. Secret names (`WATCHBOARD_ANDROID_*`, `WATCHBOARD_PLAY_SERVICE_ACCOUNT_JSON`) match across Tasks 5, 6, and 7. Task numbering is sequential and every cross-reference (e.g. "Task 2 of this plan," "see Task 5's SDK setup step") points at the renumbered task it actually describes.
