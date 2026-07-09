#!/usr/bin/env ruby
# Update homebrew Cask/attache.rb for dual-arch DMG releases (slice 4).
# Env: VERSION, TAG, REPO, SHA256_AARCH64, SHA256_X86_64, URL_AARCH64, URL_X86_64

require "fileutils"

cask = File.join(Dir.pwd, "Casks/attache.rb")
abort("missing #{cask}") unless File.file?(cask)

version = ENV.fetch("VERSION")
tag = ENV.fetch("TAG")
repo = ENV.fetch("REPO")
sha_arm = ENV.fetch("SHA256_AARCH64")
sha_intel = ENV.fetch("SHA256_X86_64")

content = <<~RUBY
  cask "attache" do
    version "#{version}"

    arch arm: "aarch64", intel: "x86_64"

    url "https://github.com/#{repo}/releases/download/#{tag}/attache-desktop-\#{arch}-#{tag}.dmg"
    sha256 arm: "#{sha_arm}", intel: "#{sha_intel}"

    name "Attache"
    desc "Local-first household finance"
    homepage "https://github.com/#{repo}"

    app "Attache.app"
  end
RUBY

File.write(cask, content)
puts "updated #{cask} → #{version} (arm + intel)"
