# ADR-010: Standalone release via Starflow + GitHub workers + Homebrew

Area: release / distribution

- **Status:** accepted
- **Date:** 2026-06-29
- **Deciders:** founder
- **Related:** ADR-009 (standalone first), Celestial `release-celestial-desktop` precedent

## Context

Attache ships as a **standalone single-device app** (ADR-009). Distribution needs:

- macOS **.dmg** for non-technical users
- **`brew install`** for developers and agents
- **No dependency** on mesh lib or Celestial dev monorepo at install time

Celestial Intelligence already proved this pattern:

1. **Starflow pipeline** orchestrates tag → `gh workflow run` → poll → publish
2. **GitHub Actions macOS workers** build DMG (Tauri) — we cannot build macOS binaries on Linux entmoot alone
3. **GitHub Release** (or R2 + public URL) hosts DMGs
4. **Separate `homebrew-tap` repo** — Cask auto-bumped via `release: published` workflow

Attache repo is **public** (`dasysad/attache`); DMGs can live on GitHub Releases directly (Celestial moved to R2 because the main repo was private).

## Decision

### Release orchestration: Starflow

Add `starflow.yaml` to attache with pipeline `release-attache-desktop`:

```text
sf run release-attache-desktop --input version=desktop-v0.1.0
  → validate (desktop-v* tag format)
  → git tag + push
  → gh workflow run build-attache-desktop.yml
  → poll until success
  → gh release create (aarch64 + x86_64 DMGs)
  → (optional) upload R2 mirror + sha256 sidecar
```

Run from developer machine or entmoot with `gh` authenticated — same as Celestial.

### Build worker: GitHub Actions only for DMG

macOS `.app` / `.dmg` builds **must** punt to GitHub `workflow_dispatch` on `macos-latest` / `macos-13`. Starflow steps only dispatch and poll; they do not compile Tauri locally.

### Homebrew: two install paths

| Install | Tap artifact | User command |
|---------|--------------|--------------|
| **CLI only** (Phase 1) | `Formula/attache.rb` | `brew install dasysad/tap/attache` |
| **Desktop app** (Phase 2) | `Casks/attache.rb` | `brew install --cask attache` |

Separate public repo: **`dasysad/homebrew-tap`** (or org equivalent).

Auto-bump: `.github/workflows/bump-homebrew-tap.yml` on `desktop-v*` release — copies Celestial's sed + PR pattern.

### DMG hosting

| Phase | Host | Why |
|-------|------|-----|
| **v0** | GitHub Release assets | Public repo; simple; Cask `url` points at `github.com/.../releases/download/...` |
| **v1** | Optional R2 mirror | CDN + stable URL if we outgrow GH asset limits |

### App shell technology

**Tauri 2** wrapping local Attache web UI (`127.0.0.1:8780`) — mirrors Celestial desktop (WKWebView shell). Alternative considered: Electron — heavier; defer.

Bundled artifacts inside `.app`:

- Node binary or compiled server + CLI
- `better-sqlite3` native module (per-arch)
- Static `attache-ui.js` / CSS
- Optional: `attache-mcp` in Resources for Cursor config template

Extract sidecar (Python/Litestar): **optional** in v0 DMG — document upload path uses in-process extractor until bundled.

### Signing

Match Celestial v0: **ad-hoc sign** (`codesign --sign -`) — no Apple Developer ID required for dogfood. Document Gatekeeper bypass. Notarization is a later upgrade (repo secrets + entitlement).

## Consequences

- Starflow is **release CI only** — not runtime dependency for end users
- `ss` remains dev supervisor (`pnpm ss:up`); not shipped in DMG
- Mesh backlog unchanged (ADR-009)

## Open items (see plan)

- Create `packages/attache-desktop` (Tauri)
- Create `dasysad/homebrew-tap`
- `HOMEBREW_TAP_TOKEN` secret
- Version stream: `desktop-vMAJOR.MINOR.PATCH` independent of npm `0.1.0`

## References

- [VS-7 packaging plan](../plans/vs-7-standalone-packaging.md)
- Celestial: `starflow.yaml` → `release-celestial-desktop`
- Celestial: `.github/workflows/build-celestial-desktop.yml`, `bump-homebrew-tap.yml`
