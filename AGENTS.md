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

```bash
# When Tauri shell exists:
sf run release-attache-desktop --input version=desktop-v0.1.0

# End user (after tap exists):
brew tap dasysad/tap && brew install --cask attache
```

**Not shipped to users:** Starsystem (`ss`), mesh, Celestial monorepo.

## Dev

```bash
pnpm ss:up
pnpm test
pnpm desktop:dev   # Tauri shell @ :8780
```
