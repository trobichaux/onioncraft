# GW2 Planner — Design Spec
_Date: 2026-03-21_

## Overview

A personal web application for Guild Wars 2 players to manage crafting profit and skin collection tracking. Built with Next.js + Azure Table Storage, designed for Azure Static Web Apps hosting, with a clean REST API layer that will serve a future iOS/iPad native app.

---

## Goals

1. **Crafting Profit Calculator** — identify the most profitable craftable items given current TP prices, the player's known recipes, and material overages after accounting for a legendary ring goal.
2. **Skin Collection Tracker** — review unowned weapon/armor skins and prioritize unlock paths (direct buy, TP, achievement, etc.) using user-defined persistent priority rules.

### Non-Goals (for now)
- Real-time TP price streaming
- Multi-user support (auth stub only)
- Mobile app (architecture supports it; not built yet)
- Profit/Hour estimation (data not available in GW2 API; deferred)
- Wiki scraping (static data files maintained manually for now)
- CI/CD pipeline (separate deliverable)

---

## Architecture

```
  Next.js Web App          iOS / iPad App (future)
       ↕                          ↕
  ─────────────────────────────────────────────
       Next.js API Routes (REST API)
       Deployed as Azure Functions via SWA
  ─────────────────────────────────────────────
        ↕                         ↕
  GW2 Public API           Azure Table Storage
  api.guildwars2.com/v2    (Settings, PriceCache,
                            GoalProgress)
        ↕
  Static Recipe Data
  data/mystic-forge-recipes.json
  data/currency-conversions.json
  data/skin-sources.json
  data/vendor-recipes.json
```

### Layers

**Frontend (Next.js / React)**
- Two primary views: Crafting Profit Calculator, Skin Collection Tracker
- Shared: navigation, API key configuration, user settings
- Components receive a `user` object (currently `{ id: "default", name: "You" }`) — ready for real auth population

**API Routes (Next.js route handlers → Azure Functions)**
Four route groups, all passing through `getRequestUser()` auth stub:
- `/api/gw2/*` — GW2 API proxy with response caching and rate-limit handling
- `/api/crafting/*` — profit calculation, dependency graph resolution, overage computation, goal progress
- `/api/skins/*` — collection diff, unlock path ranking with user rules
- `/api/settings/*` — CRUD for exclusion list, priority rules, API key, goal config

Key routes within `/api/crafting/*`:
- `POST /api/crafting/resolve-goal` — resolves the dependency tree for the selected ring, writes snapshot to GoalProgress table
- `GET /api/crafting/goal-progress` — reads current GoalProgress snapshot for the user
- `POST /api/crafting/refresh-prices` — fetches and caches TP prices
- `GET /api/crafting/profit` — returns ranked profit table using cached prices + current snapshot

**Auth Stub**
```typescript
// lib/auth.ts
export function getRequestUser(req: NextRequest): User {
  // TODO: replace with real auth (Azure AD B2C, NextAuth, etc.)
  return { id: "default", name: "You" };
}
```
Every API route calls this. Multi-user = swap this one function.

**Static Recipe Data**
The GW2 API (`/v2/recipes`) does not include Mystic Forge conversions or NPC vendor recipes. Static supplementary files (see Static Data Files section) cover these gaps. They are maintained manually and versioned in the repo.

**Azure Table Storage — Tables**

| Table | Partition Key | Row Key | Notes |
|-------|--------------|---------|-------|
| `Settings` | `userId` | `exclusionList` / `priorityRules` / `apiKey` / `goalConfig` | JSON string in `value` property. Max 64KB per entity. |
| `PriceCache` | `"shared"` | `itemId` | Fields: `buyPrice: number`, `sellPrice: number`, `cachedAt: string (ISO 8601)`. Never user-partitioned. |
| `GoalProgress` | `userId` | `goalId` (= GW2 item ID of the legendary ring, e.g. `"91234"`) | JSON string in `value` property. Includes `resolvedAt: string (ISO 8601)`. |

**GoalProgress snapshot** is refreshed on two triggers: (1) user selects a new goal, (2) user explicitly clicks "Refresh Inventory." The snapshot is point-in-time; the UI shows "Inventory last synced: X ago." Overage values in the snapshot are not recalculated live — the user must refresh to see updated values.

**Azure SWA / Next.js Compatibility Note**
Azure Static Web Apps Next.js support (hybrid rendering + API routes as Functions) is validated for Next.js App Router. Local development uses Azurite to emulate Table Storage. Environment variables (Table Storage connection string) are managed via SWA environment config and `.env.local` for local dev.

---

## GW2 API Error Handling & Rate Limiting

The GW2 API is rate-limited (approximately 600 requests/minute) and periodically returns 503s. All API proxy routes implement:

- **Retry with exponential backoff** — up to 3 retries on 429 or 503 responses
- **Request batching** — bulk endpoints (e.g. `/v2/commerce/prices`, `/v2/items`) called in batches of 200 IDs, max 5 concurrent requests
- **User-facing error states** — invalid/expired API key shows inline error prompting re-entry; API unavailability shows banner with last-successful-fetch time
- **Graceful degradation** — if TP prices cannot be refreshed, UI shows stale-price warning and continues with cached values
- **Revoked/invalid stored key** — if a stored key returns 401/403, the server marks it invalid (does not delete it). The UI enters a "key expired" state prompting re-entry. The old key is overwritten on re-entry.

---

## Feature 1: Crafting Profit Calculator

### GW2 API Endpoints Used
- `/v2/account` — validate API key
- `/v2/account/inventory` — shared inventory
- `/v2/characters/:id/inventory` — character bags
- `/v2/account/bank` — bank storage
- `/v2/account/wallet` — currencies
- `/v2/account/materials` — material storage
- `/v2/account/recipes` — recipes the account has learned
- `/v2/recipes` — recipe definitions (crafting station recipes only)
- `/v2/items` — item details
- `/v2/commerce/prices` — TP buy/sell prices (bulk, batched)
- `/v2/legendaryarmory` — legendary item IDs (entry point for goal list)

### Supported Legendary Ring Goals (v1)
The legendary ring list is seeded from `/v2/legendaryarmory` filtered to `type: "Ring"`. Each ring's dependency tree is resolved starting from its item ID. Mystic Forge steps fall back to `data/mystic-forge-recipes.json`.

### User Flow
1. User sets their GW2 API key once (stored server-side, never returned to client)
2. User selects their legendary ring goal from a list populated from `/v2/legendaryarmory`
3. App fetches: shared inventory, character inventories, bank, material storage, wallet, and learned recipes
4. App resolves the full dependency tree (`POST /api/crafting/resolve-goal`), using `/v2/recipes` for crafting station steps and `data/mystic-forge-recipes.json` for Mystic Forge steps. Snapshot persisted to GoalProgress with `resolvedAt` timestamp.
5. App walks the tree bottom-up to compute overages (see Dependency Graph section)
6. User refreshes TP prices on demand. UI shows "Prices last updated: X ago."
7. App computes profit for all craftable recipes (learned + TP-unlockable + vendor), excludes exclusion list items, and presents ranked table
8. Overage materials from step 5 reduce `crafting_cost` (their effective cost = 0)

### Dependency Graph Resolution

Materials are modeled as a DAG where leaf nodes are raw materials/currencies and the root is the legendary ring. Edges represent crafting or conversion relationships. Recipe sources: `/v2/recipes` (crafting station) and `data/mystic-forge-recipes.json` (Mystic Forge).

**Overage calculation (concrete example):**

Suppose a ring recipe requires 10 Mithril Ingots, and the player holds 15. Overage = 5. These 5 ingots are available for use in profitable crafting recipes. If two profitable recipes each use Mithril Ingots, the overage is allocated greedily — the highest-profit recipe gets first claim on the surplus, reducing its effective crafting cost.

Overage is computed per-item across the full dependency tree. Surplus at one node does not reduce requirements at a sibling node (e.g., extra Mithril Ingots don't count toward a Mithril Ore requirement).

**Currency modeling:**

Gold is the denomination of cost, not a DAG node. It is not modeled with conversion edges; it is the unit in which all crafting costs and sell prices are expressed.

The following non-gold currencies are modeled as DAG nodes with explicit conversion edges defined in `data/currency-conversions.json`:

| Currency | Conversion target | Direction |
|----------|------------------|-----------|
| Mystic Coins | Mystic Forge inputs | per recipe in mystic-forge-recipes.json |
| Spirit Shards | Philosopher's Stone | one-way (Mystic Forge) |
| Laurels | Specific vendor items | one-way |
| Karma | Specific vendor items | one-way |

`data/currency-conversions.json` example schema:
```json
[
  {
    "currencyId": 23,
    "currencyName": "Spirit Shards",
    "outputItemId": 9480,
    "outputItemName": "Philosopher's Stone",
    "ratio": 1,
    "context": "mystic_forge"
  }
]
```

### Exclusion List
- Stored as JSON string in `Settings` table (row: `exclusionList`), per user
- Managed via persistent UI panel: add/remove items by name or ID search
- Applied as a filter before the profit ranking is rendered

### Profit Calculation
GW2 TP charges two fees:
- **Listing fee:** `ceil(sell_price * 0.05)` — paid upfront, non-refundable
- **Exchange fee:** `ceil(sell_price * 0.10)` — deducted from sale proceeds

```
profit = sell_price - ceil(sell_price * 0.05) - ceil(sell_price * 0.10) - crafting_cost
```

`crafting_cost` uses overage-adjusted quantities (overage materials cost 0; remaining materials valued at current TP buy-order price).

The **craftable recipe list** for profit calculation includes:
- All recipes from `/v2/account/recipes` (learned by the account)
- All recipes from `/v2/recipes` whose recipe item is tradeable on TP (has a `/v2/commerce/prices` entry)
- All recipes in `data/vendor-recipes.json`

Only recipes whose output item is tradeable (has a `/v2/commerce/prices` entry) are included — untradeable outputs have no profit calculation.

**Results table columns:**

| Column | Description |
|--------|-------------|
| Item | Name + icon |
| Crafting Cost | Gold cost after overage adjustment |
| Sell Price | Current TP sell listing price |
| Profit | Net after both TP fees |
| Source | `Learned` / `TP Recipe` / `Vendor Recipe` |
| Exclude | Toggle to add/remove from exclusion list |

---

## Feature 2: Skin Collection Tracker

### GW2 API Endpoints Used
- `/v2/account/skins` — skin IDs unlocked on account
- `/v2/skins` — full skin catalog (bulk)
- `/v2/commerce/prices` — check if skin unlock item is TP-tradeable
- `/v2/achievements` — cross-reference achievement-gated skins

### Skin Catalog Caching Strategy
`/v2/skins` returns ~90,000+ skin IDs. The full catalog is cached in Table Storage with a 24-hour TTL — skins are added infrequently and never removed. On first load (or cache miss), the API fetches all IDs, then fetches metadata in batches of 200 (max 5 concurrent). Subsequent loads use the cache. The user can force a refresh via a manual "Refresh Skin Catalog" button.

### User Flow
1. App loads skin catalog from cache (or fetches if stale/missing)
2. App fetches account's unlocked skin IDs via `/v2/account/skins`
3. Diff: unowned = catalog minus account skins
4. Each unowned skin is categorized by acquisition method
5. User-defined priority rules rank the results
6. Results displayed as a filterable, sortable table

### Acquisition Method Categories

| Method | How determined |
|--------|---------------|
| `trading_post` | Skin's unlock item has a listing in `/v2/commerce/prices` |
| `achievement` | Cross-referenced via `/v2/achievements` |
| `direct_buy` | Listed in `data/vendor-recipes.json` vendor data |
| `gem_store` | Listed in `data/skin-sources.json` |
| `content_drop` | Listed in `data/skin-sources.json` (Black Lion Chest, festival, story) |
| `unknown` | No API or static data available — wiki URL provided as fallback |

**Coverage expectation:** Many skins have no API-discoverable acquisition path and will land in `unknown` in v1. `data/skin-sources.json` will be built out incrementally to reduce unknowns over time.

### Priority Rules
- Stored as JSON string in `Settings` table (row: `priorityRules`), per user
- Ordered list of conditions; first match wins:
  ```
  1. method = "direct_buy" AND cost < 5g → priority 1
  2. method = "trading_post" AND cost < 20g → priority 2
  3. method = "achievement" → priority 3
  4. (default) → priority 99
  ```
- UI: drag-and-drop rule editor with condition builder (method, cost threshold, skin type filter)

---

## Data Flow: TP Price Refresh

```
User clicks "Refresh Prices"
  → POST /api/crafting/refresh-prices
  → Builds item ID list:
      - All items in active GoalProgress snapshot dependency tree
      - All items in craftable recipe list (learned + TP-unlockable + vendor)
  → Fetches /v2/commerce/prices in batches of 200 IDs
      (max 5 concurrent, retry on 429/503)
  → Writes to PriceCache table:
      partition: "shared", row: itemId
      fields: buyPrice, sellPrice, cachedAt (ISO 8601)
  → Returns { updatedAt: ISO timestamp, count: N }
  → UI shows "Prices last updated: X minutes ago"
```

---

## Multi-Account & Auth Future Path

- All Table Storage reads/writes use `userId` from `getRequestUser()` as partition key
- Price cache and skin catalog cache use `"shared"` partition — never user-scoped
- All downstream code is already correct when real auth replaces the stub
- Frontend `user` object already threaded through components

### Mobile App Path
- All features exposed via REST API routes
- React Native / Expo or Swift app consumes the same endpoints
- If React Native: extract shared types and API client into `/packages/core`
- Auth tokens (JWT) work for both web and mobile consumers

---

## Security Notes

- GW2 API key stored server-side in Azure Table Storage — never returned to client or logged
- All GW2 API calls proxied through server-side API routes
- `getRequestUser()` stub is the single auth seam
- **Future:** full security audit before multi-user rollout or public deployment

---

## Static Data Files

| File | Purpose | Schema |
|------|---------|--------|
| `data/mystic-forge-recipes.json` | Mystic Forge recipe definitions (not in GW2 API) | `[{ inputs: [{itemId, count}], output: {itemId, count} }]` |
| `data/currency-conversions.json` | Wallet currency → item conversion ratios | `[{ currencyId, currencyName, outputItemId, outputItemName, ratio, context }]` |
| `data/skin-sources.json` | Supplementary skin acquisition metadata | `[{ skinId, method, notes }]` |
| `data/vendor-recipes.json` | NPC vendor recipe and skin listings | `[{ itemId, vendorName, cost, costCurrencyId }]` |

All files versioned in the repo and updated manually as game content changes.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14+ (App Router), React, TypeScript |
| Backend | Next.js API Routes → Azure Functions |
| Persistence | Azure Table Storage |
| Local dev emulation | Azurite |
| Hosting | Azure Static Web Apps |
| Dev tooling | ESLint, Prettier |
| Testing | Jest (unit), Playwright (e2e) |
| Future mobile | React Native / Expo (preferred) or Swift |

---

## Out of Scope (Future Milestones)

- Real authentication (Azure AD B2C / NextAuth)
- Multi-user support
- Security audit
- iOS / iPad app
- Profit/Hour estimation
- CI/CD pipeline
- Wiki scraping automation
- Notifications / alerts for price thresholds
