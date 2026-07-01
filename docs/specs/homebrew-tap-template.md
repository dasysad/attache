# Homebrew tap (`dasysad/homebrew-tap`)

**Live repo:** https://github.com/dasysad/homebrew-tap

```bash
brew tap dasysad/tap
brew install attache-cli          # CLI (Formula)
brew install --cask attache       # Desktop (Cask, after first DMG release)
```

Auto-bump: `.github/workflows/bump-homebrew-tap.yml` in attache repo on `desktop-v*` release.
Requires `HOMEBREW_TAP_TOKEN` secret with contents + PR write on `dasysad/homebrew-tap`.

See the tap repo for `Formula/attache-cli.rb` and `Casks/attache.rb`.
