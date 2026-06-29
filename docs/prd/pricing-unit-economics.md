# Attache pricing & unit economics analysis

- **Status:** draft
- **Date:** 2026-06-22
- **Purpose:** Transparent cost model, market sizing, and recommended price structure

## Executive summary

There **is** a market — but it is **not** "everyone needs another assistant." It is the
post-Mint paid PFM segment (~3.6M displaced users, ~$80–120/household/year norm) plus
a growing privacy/local-first niche. Attache wins on **honest unit economics** and
**household solvency focus**, not by undercutting Monarch on features.

**Recommended model:** low **platform fee** (credit-card capture) + **zero-markup
pass-through** for Plaid/SnapTrade + **usage-metered** Attache compute/storage only
when cloud services are used. Local-first free tier stays genuinely free.

---

## Market reality

### Size and shape

| Signal | Data |
|--------|------|
| Mint shutdown (Jan 2024) | ~3.6M MAU displaced to Credit Karma |
| Mint → premium capture | YNAB estimated 18–22% of churned Mint users in year one |
| Paid PFM price band (2026) | **$80–120/household/year** effective (Monarch, YNAB, Copilot, Simplifi) |
| PFM software market (2025) | ~**$2.4B** global (narrow SaaS definition); growing ~8%/yr |
| Monarch household model | One sub covers partners — ~$50/person/year at $99.99 household |

### Is there room for Attache?

**Yes, as a focused wedge — not as the next Monarch.**

| Segment | Fit |
|---------|-----|
| Ex-Mint users wanting budgeting + bank link | Moderate — crowded (Monarch, Simplifi) |
| Privacy / local-first households | **Strong** — underserved by cloud-only apps |
| Agent-native financial ops | **Strong** — Monarch has AI features but not agent-first |
| "Show me the real bill" transparency nerds | **Strong** — differentiated |
| Universal assistant (OpenClaw class) | **Poor** — wrong product |

**Realistic early TAM (US):** 200k–1M households who would pay for privacy +
solvency + agents. You do not need mass-market adoption to build a sustainable
business at $60–120/household/year with low COGS (local-first).

### What users tolerate paying

From competitor pricing:

- **$8–15/mo** is normal when value is clear (couples, bank sync, forecasts).
- Heavy **promo discounting** ($49.99 yr 1) signals price sensitivity.
- **Free tiers** exist (Empower, Rocket Money basic) but paid apps thrive without free bank sync.
- Users **do not** see Plaid broken out today — Monarch bundles aggregation into $99.99.

**Transparency bet:** technical and trust-sensitive users will prefer line-item bills;
 mainstream users need a **simple summary** ("~$11/mo total this month") with drill-down optional.

---

## Cost stack (what actually costs money)

### Pass-through (not Attache margin — bill at cost)

| Vendor | Typical household cost | Notes |
|--------|------------------------|-------|
| **Plaid** (Transactions + Balance, 3 linked accounts) | **~$2–6/mo** | Subscription per Item/month + occasional Balance calls; scales with account count and refresh frequency |
| **Plaid** (1–2 accounts, daily sync) | **~$1.50–3/mo** | Dogfood minimum |
| **SnapTrade** (premium, 1–2 users, daily data) | **~$1–2/user/mo** | PAYG; first 5 users free on *your* dev account only |
| **SnapTrade** (real-time) | **~$2/user/mo** | Premium tier option |
| **SMS** (future) | ~$0.01–0.03/msg | Twilio pass-through if added |

Plaid pricing is **per connected account (Item)**, not flat per user. A household with
checking + savings + two credit cards = 4 Items → higher pass-through.

**Directional Plaid math (Pay-as-you-go, US PFM read-only):**

- One-time link (Auth): ~$1–2 once per account (amortize mentally over life of connection).
- Transactions subscription: **~$0.30–1.50/account/month** at low volume (varies by product mix).
- **Rule of thumb for estimates:** **$0.75–1.25 per linked account per month** for read-only sync.

Monarch at $8.33/mo effective likely spends **$2–4/mo** on aggregation per active household and keeps the rest for product, support, and margin.

### Attache-owned costs (what platform fee + usage covers)

Local-first users on free tier → **~$0 marginal compute** (runs on their device).

| Cost | Per household / month (cloud-assisted premium) | Notes |
|------|-----------------------------------------------|-------|
| **Supabase** (auth, tenant metadata) | ~$0.05–0.25 | Amortized; free tier covers early scale |
| **Cloudflare R2** (5 GB encrypted docs) | ~$0.08 | $0.015/GB-mo + minimal egress |
| **Hetzner** (shared workers) | ~$0.10–0.50 | One CX42 serves thousands of tenants for sync/OCR jobs |
| **Document OCR** (self-hosted GLM-OCR) | ~$0.02–0.10/doc | GPU amortized on Hetzner; see ADR-004 |
| **Agent LLM (cloud fallback)** | ~$0.05–2.00/mo | Wide range; BYOK/local Ollama → $0 |
| **Email ingest** (inbound parse) | ~$0.01–0.05 | CF Email Workers / SES |

**Typical premium household (Plaid + cloud backup + 10 docs/mo + moderate agent):**

| Line | Amount |
|------|--------|
| Plaid (3 accounts) | $3.00 |
| Attache compute/storage | $0.40 |
| Platform fee (recommended) | $4.99 |
| **Total** | **~$8.39/mo** |

Compare Monarch **$8.33/mo** annual — you are in-band, with **honest line items**.

---

## Recommended pricing structure

### Principles

1. **Separate platform from pass-through** on every invoice.
2. **Zero markup** on Plaid/SnapTrade v1 (build trust; add processing fee only if needed later).
3. **Meter only Attache-owned** compute/storage when cloud is used.
4. **Local-first free tier** never requires a card.

### Tiers

| Tier | Card required | Platform fee | Pass-through |
|------|---------------|--------------|--------------|
| **Free** | No | $0 | None |
| **Platform** | Yes | **$4.99/mo** or **$49/yr** | Optional add-ons |
| **Connect (Plaid)** | Yes | Platform fee | Plaid at cost (estimator before link) |
| **Invest (SnapTrade)** | Yes | Platform + Connect | + SnapTrade at cost |
| **Cloud usage** | If used | Metered | OCR pages, cloud LLM tokens, R2 GB |

**Platform fee unlocks:** agents (Spacecraft), Starflow workflows, mesh cloud relay,
HITL queue, document pipeline (fair-use local OCR free; cloud OCR metered).

**v1.1 unlocks (same platform fee):** rules execution, autonomous sweeps ( + ACH rail pass-through when live).

### Usage meters (Attache-owned only)

| Meter | Unit | Suggested rate | Rationale |
|-------|------|----------------|-----------|
| Cloud doc OCR | per page | $0.02 | Covers GPU amortization; local OCR free |
| Cloud agent inference | per 1M tokens | at provider cost + 10% | Or BYOK → $0 |
| R2 storage | per GB-mo | $0.03 | R2 cost + margin tiny |
| Cloud sync relay | per GB egress | $0.05 | Optional; LAN mesh free |

Show running total in app: **"Estimated this month: $7.42"** with expandable receipt.

### Intro pricing (credit-card capture)

- **$39/yr first year** platform (matches Monarch promo psychology).
- Renew at **$59/yr** or **$5.99/mo**.
- Plaid/SnapTrade always separate lines — never hidden in "premium."

---

## Competitive positioning

| | Monarch | Attache |
|---|---------|---------|
| Price | $99.99/yr all-in | $49–60/yr platform + pass-through |
| Aggregation cost | Opaque (bundled) | **Transparent** |
| Local-first | Cloud | **Yes** |
| Agents | Add-on AI features | **First-class MCP** |
| Couples | Included | Household tenant + merge wizard (post-dogfood) |

**Risk:** Sticker shock if pass-through shown naively ("$5 + $4 Plaid + $2 SnapTrade").
**Mitigation:** Pre-connect estimator; defaults to Plaid-only; SnapTrade opt-in premium.

---

## Business viability sketch

| Scale | Households | Platform MRR | Pass-through (flowed) | Notes |
|-------|------------|--------------|----------------------|-------|
| Dogfood | 10 | ~$50 | ~$30 | Subsidized dev Plaid |
| Early | 500 | ~$2,500 | ~$1,500 | Break-even on infra easily |
| Growth | 5,000 | ~$25,000 | ~$15,000 | Hire 1 FTE; Plaid volume discounts |
| Scale | 50,000 | ~$250,000 | ~$150,000 | Custom Plaid tier; negotiate |

At 5,000 households, **~$25k platform MRR** is a real bootstrapped business with
local-first COGS. Pass-through revenue is neutral (unless you add processing fee later).

---

## Implementation notes

- Build **usage ledger** in SQLite (tenant-scoped meters) → monthly invoice generator.
- Stripe Billing Meters for platform fee; pass-through as invoice line items from internal cost table updated monthly from Plaid/SnapTrade dashboards.
- Settings → **"Cost transparency"** page: linked accounts, sync frequency, projected month.

## References

- Monarch / YNAB / Copilot pricing comparisons (2026)
- Plaid billing docs (subscription per Item)
- SnapTrade pricing ($1–2/connected user/mo PAYG)
- ADR-006 (updated with this model)
