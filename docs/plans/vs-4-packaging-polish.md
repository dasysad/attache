# Slice 4 — Packaging polish

**Status:** ✅ shipped (unsigned-first)  
**Roadmap:** [v1 hardening](./v1-hardening-roadmap.md) slice 4  
**ADR:** [012](../adr/012-desktop-signing-and-updates.md)

## Goal

Ship desktop builds users can install today **without** an Apple Developer
account. Matches the [Celestial desktop worker](https://github.com/celestial-intelligence-agency/celestial-intelligence/blob/main/.github/workflows/build-celestial-desktop.yml):

1. Starflow orchestrates tag → `gh workflow run` → poll → GitHub Release
2. **Unsigned** Tauri build on `macos-latest` + `macos-15-intel`
3. **Ad-hoc** `codesign --sign -` on the `.app` (arm64 launch requirement)
4. Optional Tauri updater once minisign key is minted via `ss vault`

Developer ID + notarization remain documented in ADR-012 for when you enroll in
the Apple Developer Program.

## Release (unsigned DMG)

```bash
sf run release-attache-desktop --input version=desktop-v0.1.0
```

Produces:

```text
attache-desktop-aarch64-desktop-v0.1.0.dmg
attache-desktop-x86_64-desktop-v0.1.0.dmg
```

First launch: right-click → Open (Gatekeeper). Or `xattr -cr "/Applications/Attache.app"`.

## Tauri updater key (ss vault + GitHub)

Updater artifacts are **off** until you mint a key (`createUpdaterArtifacts: false`).

```bash
# Requires ss (starsystem-cli) + gh auth
sf run mint-tauri-updater-key
# or: pnpm mint:updater-key
```

What it does:

1. `pnpm tauri signer generate` → minisign keypair
2. Stores in **ss vault** (`workspace=attache`, `env=prod`):
   - `TAURI_SIGNING_PRIVATE_KEY_B64`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
   - `TAURI_SIGNING_PUBLIC_KEY`
3. Syncs `TAURI_SIGNING_PRIVATE_KEY*` to **GitHub Actions secrets**
4. Patches `tauri.conf.json` — pubkey + `createUpdaterArtifacts: true`
5. **Commit** the `tauri.conf.json` change, then release

Subsequent releases also upload signed `.tar.gz` + `latest.json` when the GH
secret is set.

Read key back:

```bash
ss vault get-secret TAURI_SIGNING_PUBLIC_KEY --workspace=attache --env=prod --raw
```

## CI worker

`.github/workflows/build-attache-desktop.yml` — mirrors Celestial:

- pnpm + Rust caches
- `ATTACHE_BUNDLE_NODE=1` (embedded Node in DMG)
- Ad-hoc sign after bundle
- Optional updater signing via `TAURI_SIGNING_PRIVATE_KEY` secret

## Apple cert (later)

When enrolled, add repo secrets (`APPLE_CERTIFICATE`, …) and restore the
Developer ID import block from git history. Until then, unsigned is intentional.

## Homebrew

Dual-arch Cask bump on `desktop-v*` release — see
`.github/workflows/bump-homebrew-tap.yml`.
