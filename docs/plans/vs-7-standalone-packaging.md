# VS-7 — Standalone packaging & distribution

**Status:** in progress (desktop scaffold landed)  
**ADR:** [010](../adr/010-release-pipeline-starflow.md)  
**Package:** [packages/attache-desktop](../../packages/attache-desktop/README.md)

## Desktop app (Phase 2 — started)

```bash
pnpm desktop:dev      # Tauri + loopback server
pnpm desktop:build    # DMG (embeds Node + server bundle)
```

Tauri spawns bundled `node dist/index.js` in release; dev uses `scripts/dev-server.mjs`.

## Remaining

| Item | Status |
|------|--------|
| `dasysad/homebrew-tap` + Cask | ✅ [github.com/dasysad/homebrew-tap](https://github.com/dasysad/homebrew-tap) |
| `Formula/attache.rb` (CLI v0.1.0) | ✅ |
| First `desktop-v0.1.0` release | ⏸️ (Cask sha256 placeholder until DMG ships) |
| Custom app icon / signing | ⏸️ |
