# OnionCraft

A Guild Wars 2 planning tool for crafting profit analysis and skin collection tracking.

**Stack:** Next.js 14.x · Azure Static Web Apps · Azure Table Storage · TypeScript · Node.js 22

**Hosted at:** geekyonion.com _(coming soon)_

---

## Features

### Crafting Profit Calculator

Finds the most profitable items to craft given current Trading Post prices, accounting for:

- **Multi-goal material reservations** — overage computed across ALL active legendary goals simultaneously, not per-goal
- **Accurate TP fees** — independent `Math.ceil` on listing (5%) and exchange (10%) fees; never uses the `×0.85` shortcut that produces off-by-one copper errors
- **Recipe tree resolution** — recursive DAG including Mystic Forge recipes and vendor-only ingredients
- **Account-bound detection** — flags materials that must be farmed, never assigns a buy price
- **Daily craft limits** — items like Silk Weaving Thread shown with cap badges
- **Exclusion list** — hide items you don't want to see

### Skin Collection Tracker

Shows unowned weapon/armor skins ranked by user-defined priority rules:

- **Acquisition categorization** — Trading Post, achievement reward, vendor, Gem Store, content drop, or unknown (with wiki link)
- **Priority rules engine** — weighted scoring by type, rarity, or acquisition method
- **Catalog caching** — ~90k skins cached in Azure Table Storage with 24h TTL
- **Collection stats** — total/owned/unowned counts with progress bar

## Architecture

```
┌─────────────────────────────────────────────┐
│              Next.js 14.x App Router        │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐ │
│  │ Crafting  │  │  Skins   │  │ Settings  │ │
│  │  Pages    │  │  Pages   │  │  Pages    │ │
│  └────┬─────┘  └────┬─────┘  └─────┬─────┘ │
│       │              │              │       │
│  ┌────▼──────────────▼──────────────▼─────┐ │
│  │         API Routes (/api/v1/*)         │ │
│  └────┬──────────────┬──────────────┬─────┘ │
│       │              │              │       │
│  ┌────▼─────┐  ┌─────▼────┐  ┌─────▼─────┐ │
│  │ GW2 API  │  │  Table   │  │   Auth    │ │
│  │ Client   │  │ Storage  │  │   Stub    │ │
│  │+Resilience│  │  CRUD    │  │           │ │
│  └────┬─────┘  └─────┬────┘  └───────────┘ │
└───────┼──────────────┼──────────────────────┘
        │              │
   ┌────▼────┐   ┌─────▼──────┐
   │ GW2 API │   │   Azure    │
   │  (v2)   │   │   Table    │
   │         │   │  Storage   │
   └─────────┘   └────────────┘
```

### Resilience Patterns

The GW2 API client includes production-grade resilience:

| Pattern | Implementation |
|---------|---------------|
| **Circuit Breaker** | Per-category (prices/account/general), opens after 5 failures, 30s cooldown |
| **Retry** | Exponential backoff on 429/503, max 3 retries |
| **Rate Limiter** | Token bucket: 600 req/min, 10 tokens/sec refill |
| **Bulkhead** | Separate categories prevent one slow endpoint from starving others |
| **Cache-Aside** | PriceCache + SkinCache checked before API calls, TTL-based staleness |

### API Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/crafting/goals` | List active crafting goals |
| POST | `/api/v1/crafting/goals` | Add a crafting goal |
| DELETE | `/api/v1/crafting/goals` | Remove a crafting goal |
| GET | `/api/v1/crafting/profit` | Ranked profit table |
| POST | `/api/v1/crafting/refresh-prices` | Fetch and cache TP prices |
| GET | `/api/v1/skins/collection` | Unowned skins with acquisition methods |
| POST | `/api/v1/skins/catalog/refresh` | Refresh ~90k skin cache |
| POST/GET/DELETE | `/api/v1/settings/api-key` | API key lifecycle |
| GET/PUT | `/api/v1/settings/exclusion-list` | Item exclusion management |
| GET/PUT | `/api/v1/settings/priority-rules` | Skin priority rules |
| GET/PUT | `/api/v1/settings/character-filter` | Character filtering |
| GET | `/api/v1/gw2/*` | Authenticated GW2 API proxy |

## Design

Full spec: [`docs/superpowers/specs/2026-03-21-gw2-planner-design.md`](docs/superpowers/specs/2026-03-21-gw2-planner-design.md)

## Local Development

> **Prerequisites:** Node.js 22+, npm, [Azurite](https://github.com/Azure/Azurite), [SWA CLI](https://github.com/Azure/static-web-apps-cli)

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.local.example .env.local

# Start Azurite (Table Storage emulator) — in a separate terminal
azurite --silent --tableHost 127.0.0.1

# Start local dev server (use swa start, NOT next dev)
npm run dev:swa
```

> ⚠️ Always use `swa start` (or `npm run dev:swa`), never `next dev` alone. The SWA CLI emulates Azure routing — `next dev` will miss route conflicts and API route hijacking.

### Commands

```bash
npm run dev          # Next.js dev server only (no SWA emulation)
npm run dev:swa      # Full SWA local dev (recommended)
npm run build        # Production build
npm run lint         # ESLint + Prettier check
npm run lint:fix     # Auto-fix lint issues
npm test             # Jest unit tests (197 tests)
npm run test:watch   # Jest in watch mode
npm run test:e2e     # Playwright e2e tests
npm run type-check   # TypeScript type checking
```

## Project Structure

```
app/
  crafting/           Crafting profit calculator pages
  skins/              Skin collection tracker pages
  settings/           Settings management pages
  api/v1/             API routes (10 route handlers)
lib/
  auth.ts             getRequestUser() — single auth seam
  gw2Client.ts        GW2 API client with resilience pipeline
  tableStorage.ts     Azure Table Storage CRUD (4 tables)
  schemas.ts          Zod validation schemas
  validation.ts       Request body validation middleware
  recipeTree.ts       Recipe tree DAG + multi-goal overage calc
  profitCalc.ts       TP fee math + crafting cost computation
  skinCatalog.ts      Skin acquisition categorization + priority rules
  resilience/
    circuitBreaker.ts Token bucket rate limiter
    retryWithBackoff.ts Exponential backoff (429/503)
    rateLimiter.ts    Per-category circuit breaker
data/
  mystic-forge-recipes.json   Mystic Forge recipes (not in GW2 API)
  craft-limits.json           Daily/weekly crafting caps
  currency-conversions.json   Currency → item conversion ratios
  vendor-recipes.json         NPC vendor listings
  skin-sources.json           Supplementary skin acquisition metadata
fixtures/gw2/                 GW2 API response snapshots for testing
docs/                         Design specs and documentation
staticwebapp.config.json      SWA routing + security headers
```

## Implementation Progress

| Phase | Status | Description |
|-------|--------|-------------|
| 0 | ✅ Done | Project scaffold, layout, auth stub |
| 1 | ✅ Done | GW2 API client with Circuit Breaker, Retry, Rate Limiter |
| 2 | ✅ Done | Table Storage data layer, Zod schemas, CRUD operations |
| 3 | ✅ Done | Settings & API key management (validation, never-return-key) |
| 4 | ✅ Done | Crafting profit calculator (recipe tree, overage, TP fees) |
| 5 | ✅ Done | Skin collection tracker (catalog caching, priority rules) |
| 6 | ✅ Done | CI/CD pipeline (GitHub Actions, CodeQL, SWA deployment) |
| 7 | ✅ Done | Security hardening (OWASP audit, CSP headers, rate limiting) |

## Contributing

This is a personal project. Issues and PRs welcome.

> **OnionCraft is an unofficial fan project and is not affiliated with, endorsed by, or approved by ArenaNet or NCSOFT.**
>
> ©2010–present ArenaNet, LLC. All Rights Reserved. NCSOFT, the interlocking NC logo, ArenaNet, Guild Wars, Guild Wars 2, Heart of Thorns, Path of Fire, End of Dragons, Secrets of the Obscure, and all associated logos and designs are trademarks or registered trademarks of NCSOFT Corporation. All other trademarks are the property of their respective owners.
