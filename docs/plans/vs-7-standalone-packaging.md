# VS-7 — Standalone packaging & distribution

**Status:** Phase 2 shipped; slice 4 signing/updater complete  
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
| `dasysad/homebrew-tap` | ✅ [github.com/dasysad/homebrew-tap](https://github.com/dasysad/homebrew-tap) |
| `Formula/attache-cli.rb` | ✅ `brew install attache-cli` |
| `Casks/attache.rb` | ✅ dual-arch via bump workflow |
| Developer ID + notarization | ✅ ADR-012 — CI secrets |
| Tauri auto-update | ✅ `latest.json` on release |
| Custom app icon polish | ⏸️ backlog |
| R2 CDN mirror | ⏸️ backlog (BL-adjacent) |
