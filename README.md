# OnionCraft

A Guild Wars 2 planning tool for crafting profit analysis and skin collection tracking.

**Live at:** [onioncraft.geekyonion.com](https://onioncraft.geekyonion.com)

**Stack:** Next.js 14.x · Azure Static Web Apps · Azure Table Storage · TypeScript · Node.js 22

---

## Getting Started

### 1. Log in with GitHub

Visit [onioncraft.geekyonion.com](https://onioncraft.geekyonion.com) and click **Login** in the top-right corner. Authentication is handled via GitHub — no separate account needed.

### 2. Create a GW2 API Key

Go to the [Guild Wars 2 API Key Management](https://account.arena.net/applications) page and create a new key with these permissions:

| Permission | What OnionCraft uses it for |
|---|---|
| **account** | Basic account info and guild memberships |
| **inventories** | Bank, material storage, and character inventories |
| **wallet** | Currencies (gold, karma, spirit shards) |
| **unlocks** | Unlocked skins, dyes, recipes, and minis |
| **characters** | Character names, levels, and crafting disciplines |

> 💡 Name the key something like "OnionCraft" so you can identify it later.

### 3. Save your API Key

Navigate to the **[Settings](https://onioncraft.geekyonion.com/settings)** page, paste your key, and click **Save**. OnionCraft validates the key against the GW2 API and checks that all required permissions are present. Your key is stored server-side and is **never returned to the browser or logged**.

### 4. Use the Crafting Calculator

1. Go to **[Crafting](https://onioncraft.geekyonion.com/crafting)**
2. Add **Crafting Goals** — items you're saving materials for (e.g. legendaries). Materials needed for these goals are reserved and excluded from profit calculations.
3. Click **Refresh Prices** to fetch current Trading Post prices
4. The **Profitable Crafts** table shows the most profitable items you can craft from your remaining inventory, sorted by total profit, with quantities

### 5. Use the Skin Collection Tracker

1. Go to **[Skins](https://onioncraft.geekyonion.com/skins)**
2. Click **Refresh Collection** to fetch your owned skins, compute unowned skins, and load acquisition methods + TP prices
3. Your **Collection Progress** shows total/owned/unowned counts with a progress bar and last-refreshed timestamp
4. The **Unowned Skins** table shows what you're missing, with TP prices in gold/silver/copper, acquisition method, and a price range slider to filter by budget
5. On subsequent visits, your collection data loads **instantly from cache** — a background check detects newly unlocked skins and prompts you to refresh

---

## Features

### Crafting Profit Calculator

Identifies the most profitable items to craft from your inventory, after reserving materials for goals:

- **Inventory-aware** — reads your bank and material storage via the GW2 API
- **Goal reservation** — materials for active goals (legendaries, collections) are held back via `calculateOverages()` across ALL goals simultaneously
- **Quantity calculation** — `maxCraftableFromInventory()` tells you how many of each item you can make from remaining materials
- **Accurate TP fees** — independent `Math.ceil` on listing (5%) and exchange (10%) fees; never uses the `×0.85` shortcut that produces off-by-one copper errors
- **Recipe tree resolution** — recursive DAG including Mystic Forge recipes and vendor-only ingredients
- **Daily craft limits** — items like Lump of Mithrillium shown with cap badges
- **Gold/silver/copper display** — all prices shown in standard GW2 currency format

### Skin Collection Tracker

Shows unowned weapon/armor skins ranked by acquisition method:

- **Cross-session persistence** — owned skin IDs and collection metadata stored in Azure Table Storage; full collection result cached in localStorage for instant page loads
- **Lightweight change detection** — on page load, background check compares owned skin count with GW2 API; prompts for refresh only when changes are detected
- **Acquisition categorization** — Trading Post, achievement reward, vendor, Gem Store, content drop, or unknown (with wiki link)
- **Price range slider** — filter skins by TP price budget (min/max in gold/silver/copper)
- **Priority rules engine** — weighted scoring by type, rarity, or acquisition method
- **Catalog caching** — ~10k skins cached in Azure Table Storage
- **Collection stats** — total/owned/unowned counts with progress bar and last-refreshed timestamp

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
| GET | `/api/v1/skins/collection` | Persisted collection metadata (stats) |
| POST | `/api/v1/skins/collection/check` | Lightweight change detection (owned count diff) |
| POST | `/api/v1/skins/collection/refresh` | Full refresh: fetch owned, compute unowned, persist |
| POST | `/api/v1/skins/catalog/refresh` | Refresh ~90k skin cache |
| POST/GET/DELETE | `/api/v1/settings/api-key` | API key lifecycle |
| GET/PUT | `/api/v1/settings/exclusion-list` | Item exclusion management |
| GET/PUT | `/api/v1/settings/priority-rules` | Skin priority rules |
| GET/PUT | `/api/v1/settings/character-filter` | Character filtering |
| GET | `/api/v1/gw2/*` | Authenticated GW2 API proxy |
| GET | `/api/v1/shopping-list` | Persisted shopping list (plugin-friendly) |
| POST | `/api/v1/shopping-list` | Save items to shopping list |
| PATCH | `/api/v1/shopping-list` | Toggle item completed status |
| DELETE | `/api/v1/shopping-list` | Remove item or clear all |

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
npm test             # Jest unit tests (241 tests)
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
  api/v1/             API routes (13 route handlers)
lib/
  auth.ts             getRequestUser() — single auth seam
  gw2Client.ts        GW2 API client with resilience pipeline
  tableStorage.ts     Azure Table Storage CRUD (5 tables)
  logger.ts           Structured JSON logger (captured by Azure SWA)
  inventory.ts        Fetch player bank + material storage
  recipeTree.ts       Recipe tree DAG + overage calc + craftable quantity
  profitCalc.ts       TP fee math + crafting cost computation
  skinCatalog.ts      Skin acquisition categorization + priority rules
  formatCurrency.tsx  Gold/silver/copper display components
  schemas.ts          Zod validation schemas
  validation.ts       Request body validation middleware
  resilience/
    circuitBreaker.ts Per-category circuit breaker
    retryWithBackoff.ts Exponential backoff (429/503)
    rateLimiter.ts    Token bucket rate limiter
data/
  mystic-forge-recipes.json     Mystic Forge recipes (not in GW2 API)
  profitable-candidates.json    Curated list of profitable craftable items
  craft-limits.json             Daily/weekly crafting caps
  currency-conversions.json     Currency → item conversion ratios
  vendor-recipes.json           NPC vendor listings
  skin-sources.json             Supplementary skin acquisition metadata
fixtures/gw2/                   GW2 API response snapshots for testing
docs/                           Design specs, deployment guide, security review
staticwebapp.config.json        SWA routing + auth + security headers
```

## Implementation Progress

| Phase | Status | Description |
|-------|--------|-------------|
| 0 | ✅ Done | Project scaffold, layout, auth stub |
| 1 | ✅ Done | GW2 API client with Circuit Breaker, Retry, Rate Limiter |
| 2 | ✅ Done | Table Storage data layer, Zod schemas, CRUD operations |
| 3 | ✅ Done | Settings & API key management (validation, permission check) |
| 4 | ✅ Done | Crafting profit calculator (inventory, recipe tree, overage, TP fees) |
| 5 | ✅ Done | Skin collection tracker (catalog caching, price range filter) |
| 6 | ✅ Done | CI/CD pipeline (GitHub Actions, CodeQL, SWA deployment) |
| 7 | ✅ Done | Security hardening (OWASP audit, CSP headers, rate limiting) |

## Deployment

- **Hosting:** Azure Static Web Apps (Free tier) with hybrid Next.js rendering
- **Storage:** Azure Table Storage (`onioncraftstorage`, Standard_LRS)
- **Domain:** `onioncraft.geekyonion.com` (CNAME via Cloudflare, auto-TLS by Azure)
- **Auth:** SWA Built-in Auth (GitHub provider)
- **CI/CD:** GitHub Actions — lint → type-check → test → build → deploy on every push to `main`

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for full deployment guide and billing controls.

## Contributing

This is a personal project. Issues and PRs welcome.

> **OnionCraft is an unofficial fan project and is not affiliated with, endorsed by, or approved by ArenaNet or NCSOFT.**
>
> ©2010–present ArenaNet, LLC. All Rights Reserved. NCSOFT, the interlocking NC logo, ArenaNet, Guild Wars, Guild Wars 2, Heart of Thorns, Path of Fire, End of Dragons, Secrets of the Obscure, and all associated logos and designs are trademarks or registered trademarks of NCSOFT Corporation. All other trademarks are the property of their respective owners.
