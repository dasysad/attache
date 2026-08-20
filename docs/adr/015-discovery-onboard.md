# ADR-015: Low-friction discovery onboarding

Area: product / ingestion / agent-first UX

- **Status:** accepted
- **Date:** 2026-08-16
- **Deciders:** founder
- **Related:** ADR-004 (ingest), ADR-007 (IMAP), ADR-008 (Gmail OAuth),
  ADR-014 (command center, works without a bank link),
  [vs-discovery-onboard.md](../plans/vs-discovery-onboard.md),
  [vs-obligations-parity.md](../plans/vs-obligations-parity.md)

## Context

Onboard today is **identity + one account + optional bill**:

```text
attache onboard --household --holder [--complete-setup]
→ optional: ingest discover-sandbox | ingest discover
→ optional: ingest confirm | plaid connect | snaptrade connect
→ optional: accounts create | obligations create
→ web wizard: household → find mail → connect hints → account → obligation
```

That is correct and skippable, but it is **not** how a household actually
starts. The real first job is:

> “Find my bills, statements, invoices, accounts, entities, and assets —
> then let me add cards, banks, and investments with as few clicks as
> possible.”

Mint/Monarch friction we must not copy: **bank link required**, full mailbox
scrape, auto-created junk accounts, no agent path. Firefly friction: empty
books until the user types everything.

Gmail first-sync already searches `"bill OR invoice OR statement"`
(`LiveGmailAdapter`) and funnels likely bills through extract →
`ingested_event` → HITL confirm. Statements are classified
(`IngestKind` / document `classifier`) but **not** turned into “connect this
institution” hints. Invoices share the bill path. There is no entity or
asset register.

## Decision

Onboarding is a **progressive discovery loop**, not a gated wizard. Every
step is skippable. Gmail and Plaid are accelerators, never requirements.
CLI/MCP are the operator surface; the web wizard is a projection of the
same domain (ADR-014).

### Jobs (in order, all optional after household)

1. **Name the household** — `onboard` (already shipped).
2. **Find documents in mail** — one Gmail OAuth (or IMAP) → bounded lookback.
3. **Review candidates** — HITL; never auto-promote to obligations or Link.
4. **Connect money** — Plaid (banks/cards/loans), SnapTrade (brokerage), or
   manual accounts (always first-class).
5. **Fill remaining gaps** — `obligations create`, `accounts create`.
6. **Land on the command center** — runway + attention, not a “you’re done”
   marketing screen.

### Discovery taxonomy (what “find in Gmail” means)

Reuse the existing ingest pipeline. **Do not** stand up a second mailbox
reader or a CRM.

| Candidate | Mail signals (examples) | Becomes | HITL |
|-----------|-------------------------|---------|------|
| **Bill** | bill, payment due, utility, autopay | `obligation` | confirm (existing) |
| **Invoice** | invoice, amount due | `obligation` cadence `once` | confirm |
| **Statement** | bank/card/brokerage statement | **institution hint** → Plaid or SnapTrade | user still consents to Link |
| **Receipt** | receipt, paid | optional “already paid” / activity hint | skip by default |
| **Payroll / income** | paystub, direct deposit | checking hint + optional income note | confirm |
| **Insurance** | auto/home/policy, premium due | obligation + optional asset hint | confirm |
| **Tax** | property tax, 1098, 1099 | yearly obligation; property hint | confirm |
| **School / care** | tuition, childcare | obligation | confirm |
| **Entity (payee)** | vendor on a bill | payee string on the obligation | implicit on confirm |
| **Asset hint** | VIN, property address, policy number | thin optional register (P4) | confirm; **not a DMS** |

Medical EOBs and anything that looks like PHI stay **unpromoted** unless the
user explicitly confirms. We do not build a health vault.

**Entities** are payee/institution names, not contacts. **Assets** are
optional hints that improve net-worth later (property, vehicle) — not
document storage.

### Connect taxonomy (what “add cards, banks, investments” means)

| Rail | Adds | Consent |
|------|------|---------|
| **Plaid Link** | checking, savings, credit, loan | browser/loopback (CLI) |
| **SnapTrade** | brokerage + positions | Connection Portal / sandbox |
| **Manual** | any `FundingAccountKind`, including cash | CLI/MCP/web form |
| **Gmail / IMAP** | documents → candidates (above) | OAuth / app password |
| **Upload** | PDF/image → same extract path | file on disk |

Later (not this ADR’s P1): CSV/OFX import, photo-of-card. **Not** crypto
exchanges, Apple Wallet scrape, or “scan the fridge magnets.”

### Friction rules (non-negotiable)

1. **Never require Gmail or a bank link to finish.** `--complete-setup` and
   manual accounts remain valid. (ADR-014: works without a bank link.)
2. **One Gmail OAuth**, `gmail.readonly`, tokens in vault (ADR-008). IMAP
   remains the non-Google path (ADR-007).
3. **Bounded lookback** — default ~90 days and a hard cap on messages
   fetched on first discover. Not a full mailbox dump. Incremental
   `historyId` after that.
4. **HITL for promotion.** Confidence threshold unchanged
   (`HITL_CONFIDENCE_THRESHOLD`). Discover may *classify* more kinds; it
   must not auto-create obligations or Plaid items.
5. **Link is always explicit.** Statement hints pre-fill “this looks like
   Chase checking” — the human/agent still runs `plaid connect`.
6. **Skip / later / ignore** on every candidate. Attention strip (ADR-014)
   is how leftover work reappears.
7. **Agent-first:** one domain function; CLI and MCP wrap it; web wizard
   calls the same function. Sandbox adapters for dogfood without keys.
8. **Honesty:** connecting Gmail does not pay bills; connecting Plaid does
   not ACH (ADR-013).

### Agent path (target)

```bash
attache onboard --household "Smith" --holder "Alex"
attache ingest gmail connect          # or connect-sandbox
attache ingest discover               # P1: candidates JSON (bills + hints)
attache ingest confirm <eventId>      # existing: bill → obligation
attache plaid connect                 # optional; hints may name the institution
attache snaptrade connect-sandbox     # optional
attache accounts create …             # gaps
attache obligations create …          # gaps (P0 shipped)
attache agent attention               # leftover HITL / overdue / sync
```

MCP mirrors those verbs. Web `/onboard/*` is the same loop with buttons.

### Anti-goals

- Auto-promote bills without HITL.
- Auto-Link a bank because a statement appeared in Gmail.
- Mint-style “connect a bank to continue.”
- Full-mailbox search, hosted mail ingress (BL-8), or storing raw mail
  long-term in SQLite.
- A CRM, document management system, or net-worth asset app in P1.
- Python OCR sidecar as a P1 dependency — keep the current extract adapter;
  swap engines later per `document-ocr-strategy.md`.
- CalDAV, mesh household onboarding, or WorkOS-as-Gmail (ADR-008).

## Alternatives considered

| Option | Verdict |
|--------|---------|
| **Bank-first wizard (Mint)** | Fast balances, terrible when sync dies; blocks agents |
| **Empty books (Firefly)** | Honest, high friction; we already have mail extract |
| **Unconstrained mailbox dump** | Privacy + cost + junk; violates bounded lookback |
| **LLM labels every email** | Overkill; keyword + existing extract first; VLM stays in OCR strategy |
| **Separate “discover” product** | Second pipeline; we extend ingest instead |

## Consequences

- P0 (obligations CLI/MCP) unblocks agents filling gaps without mail.
- P1 (`discoverMailCandidates`) ranks bills vs statement connect hints;
  poll/confirm stay. Newsletters never become events. Lookback/limit are capped.
- P2 (`formatDiscoverMessage`, Connect hint cards) is the human projection
  of those hints — still no auto-Link. Matching a linked Chase/Fidelity
  name hides that card.
- P3 web wizard is the same loop with buttons: `/onboard/discover` then
  `/onboard/connect` when hints remain; skippable; GET never polls.
  `--complete-setup` still skips. CLI/MCP `next` names optional discover.
- P4 thin register: `household_asset` (home/vehicle) via HITL
  `assets confirm`; entities are payee/institution projections. PHI/EOBs
  stay unpromoted. Unvalued assets are omitted from net worth. Not a DMS
  and not a wizard step.
- First-sync Gmail query uses `newer_than:{days}d` and maxResults ≤ 40;
  `isLikelyBillEmail` requires financial keywords (not mere attachments).

## Implementation plan

See [vs-discovery-onboard.md](../plans/vs-discovery-onboard.md).
