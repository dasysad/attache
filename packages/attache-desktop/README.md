# @attache/desktop

Attache desktop app — Tauri 2 shell over the loopback `@attache/server` UI.
Implements [ADR-010](../../docs/adr/010-release-pipeline-starflow.md).

## Architecture

```text
Attache.app (Tauri / WKWebView)
  ├── WebView → http://127.0.0.1:8780  (SSR + Lit UI)
  └── Node sidecar (release only)
        node dist/index.js  (server-bundle in Resources)
```

Data lives in `~/.attache/` — same as CLI.

## Dev

```bash
pnpm install
pnpm --filter @attache/desktop dev
```

`beforeDevCommand` builds core/ui/server and starts `node dist/index.js` on :8780.

Override UI URL:

```bash
ATTACHE_UI_URL=http://127.0.0.1:8780/app/accounts pnpm --filter @attache/desktop dev
```

## Build DMG (local)

```bash
pnpm --filter @attache/desktop build
# or per-arch:
pnpm --filter @attache/desktop build:arm64
pnpm --filter @attache/desktop build:x64
```

Output:

```text
packages/attache-desktop/src-tauri/target/release/bundle/dmg/Attache_0.1.0_aarch64.dmg
```

`prepare-bundle.mjs` embeds Node 22 when `ATTACHE_BUNDLE_NODE=1` (set in `beforeBuildCommand`).

## Release (Starflow)

```bash
sf run release-attache-desktop --input version=desktop-v0.1.0
```

## Gatekeeper (ad-hoc signed builds)

```bash
xattr -cr "/Applications/Attache.app"
```

## Install (after Homebrew tap lands)

```bash
brew tap dasysad/tap
brew install --cask attache
```
