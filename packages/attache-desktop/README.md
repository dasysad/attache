# @attache/desktop

Attache desktop app — Tauri 2 shell over the loopback `@attache/server` UI.
Implements [ADR-010](../../docs/adr/010-release-pipeline-starflow.md) and
[ADR-012](../../docs/adr/012-desktop-signing-and-updates.md).

## Architecture

```text
Attache.app (Tauri / WKWebView)
  ├── WebView → http://127.0.0.1:8780  (SSR + Lit UI)
  ├── Node sidecar (release only)
  │     node dist/index.js  (server-bundle in Resources)
  └── Updater (release) → GitHub Releases latest.json
```

Data lives in `~/.attache/` — same as CLI.

## Dev

```bash
pnpm install
pnpm --filter @attache/desktop dev
```

`beforeDevCommand` builds core/ui/server and starts `node dist/index.js` on :8780.

## Build DMG (local)

```bash
pnpm --filter @attache/desktop build
# or per-arch:
pnpm --filter @attache/desktop build:arm64
pnpm --filter @attache/desktop build:x64
```

With Apple credentials:

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: …"
export APPLE_ID=… APPLE_PASSWORD=… APPLE_TEAM_ID=…
pnpm --filter @attache/desktop build:arm64
```

## Release (Starflow)

```bash
sf run release-attache-desktop --input version=desktop-v0.1.0
```

Produces per-arch DMGs, signed updater `.tar.gz`, and `latest.json`.

## Gatekeeper (unsigned builds)

Right-click → Open on first launch, or `xattr -cr "/Applications/Attache.app"`.

## Updater key (one-time)

```bash
sf run mint-tauri-updater-key
```

## Release (Starflow)

```bash
brew tap celestial-intelligence-agency/tap
brew install --cask attache
```

## Updater keys

See [vs-4-packaging-polish.md](../../docs/plans/vs-4-packaging-polish.md).
