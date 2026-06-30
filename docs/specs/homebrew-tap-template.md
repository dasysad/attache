# Homebrew tap template (`dasysad/homebrew-tap`)

Create a **separate public repo** with this layout:

```text
homebrew-tap/
  Formula/
    attache.rb          # CLI — Phase 1
  Casks/
    attache.rb          # Desktop DMG — Phase 2
  README.md
```

## Cask (desktop) — starter

```ruby
cask "attache" do
  version "0.1.0"
  sha256 "REPLACE_ON_RELEASE"

  url "https://github.com/dasysad/attache/releases/download/desktop-v#{version}/attache-desktop-aarch64-desktop-v#{version}.dmg"
  name "Attache"
  desc "Local-first household finance attache"
  homepage "https://github.com/dasysad/attache"

  depends_on macos: ">= :sonoma"

  app "Attache.app"

  zap trash: [
    "~/Library/Application Support/com.attache.desktop",
  ]
end
```

## Formula (CLI) — starter

```ruby
class Attache < Formula
  desc "Household finance CLI and agent tools"
  homepage "https://github.com/dasysad/attache"
  url "https://github.com/dasysad/attache/archive/refs/tags/v0.1.0.tar.gz"
  sha256 "REPLACE"
  license "MIT"
  head "https://github.com/dasysad/attache.git", branch: "main"

  depends_on "node@22"
  depends_on "pnpm"

  def install
    system "pnpm", "install", "--frozen-lockfile"
    system "pnpm", "build"
    bin.install "packages/cli/dist/main.js" => "attache"
  end

  test do
    system "#{bin}/attache", "--help"
  end
end
```

## Install UX

```bash
brew tap dasysad/tap
brew install attache              # CLI
brew install --cask attache         # desktop (after Phase 2)
```

Auto-bump: `bump-homebrew-tap.yml` in attache repo (requires `HOMEBREW_TAP_TOKEN`).
