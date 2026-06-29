# Credential hygiene — future scope (research)

**Status:** research / deferred  
**Date:** 2026-06-27  
**Related:** [VS-0 + VS-1](./vs-0-vs-1.md), [Attache v1 PRD](../prd/attache-v1.md)

## Question

Is there an existing app that rotates passwords across *all* of a user's personal
web accounts (banks, stores, social, entertainment, etc.)?

**Answer:** No production-quality universal product exists today.

## Market landscape (2026)

| Category | Examples | What they actually do |
|----------|----------|------------------------|
| **Major password managers** | 1Password, Bitwarden, NordPass | Breach/weak/reuse detection; generate passwords; deep-link to change-password pages. No scheduled bulk rotation. |
| **Platform-native (curated sites)** | Google Password Manager (Chrome), Apple Passwords (iOS 27+) | One-tap automated change on *partner* sites only (e.g. Spotify, Netflix, H&M). Banks and many retailers remain manual. |
| **Discontinued attempt** | Dashlane Password Changer (2014–2022) | One-click rotation; dropped — per-site UI maintenance broke constantly as sites changed flows. |
| **Semi-automated bulk tools** | The Password App, PassAutomate, PassUp (OSS) | Browser automation + CSV import; fragile (CAPTCHA, 2FA, site redesigns); requires per-site tuning. |
| **Enterprise IAM** | Locke Lookout, CyberArk, Delinea | Org/shared credentials, compliance rotation — not personal Netflix + Chase + Instagram. |

## Why universal rotation fails

1. **No standard API** — each site implements login, 2FA, CAPTCHA, and password
   change differently; many sites resist automation.
2. **Maintenance cliff** — Dashlane proved site-by-site "recipes" do not scale.
3. **Security tradeoffs** — fully automated rotation often requires credentials
   to pass through a middleman or headless browser, increasing lockout and
   fraud risk.
4. **Weak standard adoption** — [`.well-known/change-password`](https://developer.chrome.com/docs/identity/automated-password-change)
   helps find the change page but does not complete the flow; `autocomplete`
   attributes are inconsistently used.

Industry direction: **detect problems → assist manual fix → migrate to passkeys**,
not calendar-based rotation of every account.

## Relevance to Attache

Attache is a **life-finance attache**, not a password manager. Credential hygiene
may still matter when:

- A breach affects a bill-pay or bank login the user tracks in Attache.
- Ingestion or Plaid reconnect fails because credentials changed elsewhere.
- An agent needs to know which accounts are "high value" (funding, obligations).

## Proposed wedge (if we build anything)

Do **not** target universal scheduled rotation. Prefer:

| Priority | Capability | Rationale |
|----------|------------|-----------|
| P0 | **Event-driven alerts** | Tie to breach signals (HIBP), reuse detection, or Attache-linked account list — rotate when risk spikes, not every N days. |
| P1 | **High-value account shortlist** | Funding accounts, billers with stored payment methods, services tied to obligations — small curated set, not entire vault. |
| P2 | **Assisted change (HITL)** | Agent opens change-password URL, pre-fills generated password, user completes 2FA/CAPTCHA — same pattern as transfer HITL. |
| P3 | **Passkey migration nudges** | Where supported, recommend passkeys over password rotation. |
| Out of scope | Headless bulk rotation across all personal sites | Same failure mode as Dashlane; conflicts with focused product scope. |

Possible future slice: **VS-11 — Credential hygiene (agent-assisted)** — post
VS-5 (Agent MCP) and optional integration with OS password manager / 1Password
Connect for read-only vault metadata (no credential storage in Attache v1).

## Non-goals (current sprint)

- Building a password manager or competing with 1Password/Bitwarden.
- Storing plaintext or encrypted website passwords in Attache SQLite (VS-0–VS-1).
- Automated login/rotation against banks before licensed ingest paths exist.

## References

- [Password update processes on top-ranked websites (arxiv, 2025)](https://arxiv.org/html/2511.10111v2)
- [Chrome automated password change (Google)](https://developer.chrome.com/docs/identity/automated-password-change)
- [1Password — no auto-change (community)](https://www.1password.community/discussions/1password/password-change-fully-automatically/39433)
- [Dashlane Password Changer discontinued (2022)](https://support.dashlane.com/hc/en-us/articles/19622000915602)
