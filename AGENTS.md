# Attache — agent guide

## Strategy: standalone prototype first (ADR-009)

Mesh is **backlog** — see [docs/backlog.md](docs/backlog.md).

## Current sprint: VS-7 packaging (ADR-010)

Release via **Starflow** → **GitHub Actions** (macOS DMG) → **Homebrew tap**.

| Doc | Purpose |
|-----|---------|
| [vs-7-standalone-packaging.md](docs/plans/vs-7-standalone-packaging.md) | Phases + checklist |
| [ADR-010](docs/adr/010-release-pipeline-starflow.md) | Decision |
| [homebrew-tap-template.md](docs/specs/homebrew-tap-template.md) | Tap repo starter |

Tap: [dasysad/homebrew-tap](https://github.com/dasysad/homebrew-tap) — set `HOMEBREW_TAP_TOKEN` on this repo for auto-bump PRs.

```bash
# Release desktop DMG:
sf run release-attache-desktop --input version=desktop-v0.1.0

# End user:
brew tap dasysad/tap
brew install attache              # CLI (v0.1.0)
brew install --cask attache       # desktop (after first desktop-v* DMG release)
```

**Not shipped to users:** Starsystem (`ss`), mesh, Celestial monorepo.

## Dev

```bash
pnpm ss:up
pnpm test
pnpm desktop:dev   # Tauri shell @ :8780
```
