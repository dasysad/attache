# Lens gallery (Attache)

Design-system viewer powered by [@celestial/lens](https://github.com/celestial-intelligence-agency/celestial-orchestration/tree/main/packages/lens).

## Prerequisites

Sibling checkout of **celestial-intelligence** at:

```
../celestial-intelligence   # relative to attache repo root
```

The gallery links `@celestial/lens` and `@celestial/lens-cli` from that path.

## Commands

```bash
# from attache repo root
pnpm lens

# or from this package
pnpm dev
```

Open **http://localhost:7777** — switch **Household (dark)** vs **Daylight (light)** in the sidebar.

## Story groups

| Group | Stories |
|-------|---------|
| **Tokens** | Color (dark + Daylight), Fonts, Typography, Spacing & radius, Borders, Elevation, Motion |
| **Primitives** | Button, Input, Card, Chip, Badge, Checkbox, Toggle, Select, Account row, Transaction row, Position row, Wizard steps, … |
| **Patterns** | Command center, Net worth, Cash flow, Ledger dashboard, Investments, Cost receipt |

## Adding stories

1. Create `stories/<name>.story.ts` exporting `story: Story`
2. Import components via `@attache/ui/att-<name>`
3. Tokens live in `packages/ui/src/theme/tokens.css`

**Important:** `att-*` components must be **decorator-free** (`static properties` + `customElements.define`), not `@property` / `@customElement`. Lens uses plain Vite without TypeScript decorator transforms — same rule as `cel-*` in Celestial.

## Handoff

Mesh library requirements for Starsystem: [`docs/specs/mesh-lib-consumer-requirements.md`](../../docs/specs/mesh-lib-consumer-requirements.md)
