# VS-2 — Web dashboard polish

**Status:** complete  
**Date:** 2026-06-27  
**Builds on:** [VS-0 + VS-1](./vs-0-vs-1.md)

## Outcome

Dogfooders get a **visual runway** and **guided onboarding** without Plaid.

| Item | Status |
|------|--------|
| `att-runway-chart` — 30-day balance SVG | ✅ |
| `att-obligation-timeline` — horizon markers | ✅ |
| `att-wizard-steps` — onboarding indicator | ✅ |
| 3-step wizard: household → account → bill | ✅ |
| Dashboard embeds chart + timeline | ✅ |
| Lens stories | ✅ |

## Onboarding flow

1. `/onboard` — household + member  
2. `/onboard/account` — first funding account (required)  
3. `/onboard/obligation` — first bill or skip  
4. `/` — dashboard with runway chart

`app_meta.setup_complete` gates the wizard; existing installs without the flag are prompted through account step.

## Next (VS-3)

Plaid ingest adapter → `IngestedEvent` → transaction rows on dashboard.

## References

- [PRD VS-2](../prd/attache-v1.md)
- [Lens ledger dashboard story](../packages/lens-gallery/stories/ledger-dashboard.story.ts)
