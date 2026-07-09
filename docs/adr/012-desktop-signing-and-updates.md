# ADR-012: Desktop signing, notarization, and auto-update

Area: release / desktop packaging

- **Status:** accepted
- **Date:** 2026-07-08
- **Deciders:** founder
- **Related:** ADR-010 (Starflow release pipeline), v1 hardening slice 4

## Context

VS-7 shipped ad-hoc signed DMGs (arm64 only in practice). After VS-8 encryption
at rest, households can trust Attache with real finance data — but macOS
Gatekeeper still blocks ad-hoc apps from the browser, and Intel Mac users need
their own binary.

Celestial desktop solved this with Developer ID + notarization and Tauri updater
manifests on GitHub Releases.

## Decision

### Default: unsigned DMGs (Celestial pattern)

Match `build-celestial-desktop.yml`:

- Tauri build on GitHub macOS matrix (arm64 + x86_64)
- Ad-hoc `codesign --sign -` on the `.app` after bundle
- No Apple Developer Program required for dogfood releases
- Users bypass Gatekeeper via right-click → Open

Developer ID + notarization are **optional** when `APPLE_*` repo secrets exist
(see plan doc — not required for v1 short run).

### Dual-arch artifacts

Keep the existing matrix (`macos-latest` + `macos-15-intel`). Name assets
predictably for Homebrew and updater:

- `attache-desktop-{aarch64|x86_64}-desktop-vX.Y.Z.dmg`
- `attache-updater-{aarch64|x86_64}-desktop-vX.Y.Z.tar.gz` + `.sig`

### Auto-update

Enable Tauri updater plugin (`tauri-plugin-updater`) when ready:

- `createUpdaterArtifacts: false` until key minted (unsigned releases stay simple)
- **`sf run mint-tauri-updater-key`** — generates minisign pair, stores in
  `ss vault` (`workspace=attache`, `env=prod`), syncs to GitHub secrets,
  patches `tauri.conf.json` pubkey
- `latest.json` on GitHub Release when updater bundles are built
- App checks on startup (release builds)

Endpoint: GitHub Releases `latest/download/latest.json` (public repo).

### Homebrew Cask

Bump workflow writes dual-arch Cask (`arch arm:` / `intel:`) with separate
sha256 values — one `brew install --cask attache` works on Apple Silicon and Intel.

## Consequences

- Maintainers must store Apple + updater secrets in GitHub; document in
  [vs-4-packaging-polish.md](../plans/vs-4-packaging-polish.md)
- Ad-hoc path remains for contributors without Apple Developer accounts
- Updater pubkey rotation requires a new desktop release (embedded in binary)

## References

- [VS-4 packaging plan](../plans/vs-4-packaging-polish.md)
- [Tauri macOS signing](https://v2.tauri.app/distribute/sign/macos/)
- [Tauri updater plugin](https://v2.tauri.app/plugin/updater/)
