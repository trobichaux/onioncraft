# GW2 Planner — Design Spec
_Date: 2026-03-21_

## Overview

A personal web application for Guild Wars 2 players to manage crafting profit and skin collection tracking. Built with Next.js + Azure Table Storage, designed for Azure Static Web Apps hosting, with a clean REST API layer that will serve a future iOS/iPad native app.

---

## Goals

1. **Crafting Profit Calculator** — identify the most profitable craftable items given current TP prices, the player's known recipes (filtered by available crafting disciplines), and material overages after accounting for one or more simultaneous legendary goals.
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
       Next.js API Routes (REST API, versioned at /api/v1/)
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
  data/craft-limits.json
```

### Layers

**Frontend (Next.js / React)**
- Two primary views: Crafting Profit Calculator, Skin Collection Tracker
- Shared: navigation, API key configuration, user settings
- Components receive a `user` object (currently `{ id: "default", name: "You" }`) — ready for real auth population

**API Routes (Next.js route handlers → Azure Functions)**
All routes versioned under `/api/v1/` to support future mobile app clients without breaking changes.
Four route groups, all passing through `getRequestUser()` auth stub:
- `/api/v1/gw2/*` — GW2 API proxy with response caching and rate-limit handling
- `/api/v1/crafting/*` — profit calculation, dependency graph resolution, overage computation, goal progress
- `/api/v1/skins/*` — collection diff, unlock path ranking with user rules
- `/api/v1/settings/*` — CRUD for exclusion list, priority rules, API key, goal config

Key routes within `/api/v1/crafting/*`:
- `GET /api/v1/crafting/goals` — returns list of all active goals for the user
- `POST /api/v1/crafting/goals` — adds a new legendary goal (body: `{ itemId }`)
- `DELETE /api/v1/crafting/goals/:itemId` — removes a goal
- `POST /api/v1/crafting/goals/resolve` — resolves/refreshes dependency tree snapshots for ALL active goals
- `POST /api/v1/crafting/refresh-prices` — fetches and caches TP prices
- `GET /api/v1/crafting/profit` — returns ranked profit table using cached prices + all active goal snapshots

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
The GW2 API (`/v2/recipes`) does not include Mystic Forge conversions, NPC vendor recipes, daily craft limits, or account-bound flags. Static supplementary files cover these gaps. They are maintained manually and versioned in the repo. Each file includes a `lastVerified` top-level field (ISO date) — update this after verifying accuracy following major GW2 patches.

**Azure Table Storage — Tables**

| Table | Partition Key | Row Key | Notes |
|-------|--------------|---------|-------|
| `Settings` | `userId` | `exclusionList` / `priorityRules` / `apiKey` / `characterFilter` | JSON string in `value` property. Max 64KB per entity. |
| `PriceCache` | `"shared"` | `itemId` | Fields: `buyPrice: number`, `sellPrice: number`, `cachedAt: string (ISO 8601)`. Never user-partitioned. |
| `GoalProgress` | `userId` | `goalId` (= GW2 item ID of the legendary item) | One row per active goal. JSON string in `value` property. Includes `resolvedAt: string (ISO 8601)`. Multiple rows per user are expected and supported. |
| `SkinCache` | `"shared"` | `skinId` | Fields: `name`, `type`, `icon`, `cachedAt`. TTL: 24 hours. Never user-partitioned. |

**Multiple simultaneous goals are supported.** Each active goal is a separate row in GoalProgress (same `userId` partition, different `goalId` row key). Overage calculation sums reserved materials across ALL active goals — materials needed for any goal are unavailable for profit crafting.

**GoalProgress snapshots** are refreshed on two triggers: (1) user adds a new goal, (2) user explicitly clicks "Refresh Inventory." All active goal snapshots are refreshed together. The UI shows "Inventory last synced: X ago."

**Azure SWA / Next.js Compatibility Note**
Azure Static Web Apps Next.js support (hybrid rendering + API routes as Functions) is validated for Next.js App Router. Local development uses Azurite to emulate Table Storage. Environment variables (Table Storage connection string) are managed via SWA environment config and `.env.local` for local dev.

---

## GW2 API Error Handling & Rate Limiting

The GW2 API is rate-limited (approximately 600 requests/minute) and periodically returns 503s. All API proxy routes implement:

- **Retry with exponential backoff** — up to 3 retries on 429 or 503 responses
- **Request batching** — bulk endpoints called in batches of 200 IDs, max 5 concurrent requests
- **User-facing error states** — invalid/expired API key shows inline error prompting re-entry; API unavailability shows banner with last-successful-fetch time
- **Graceful degradation** — stale-price warning shown if refresh fails; app continues with cached values
- **Revoked/invalid stored key** — if stored key returns 401/403, server marks it invalid (does not delete it). UI enters "key expired" state prompting re-entry. Old key overwritten on re-entry.
- **Permission validation** — on key entry, validate that all required permissions are present. Show a specific error if any are missing (e.g. "Your API key is missing the 'inventories' permission").

### Required API Key Permissions
| Permission | Used for |
|-----------|---------|
| `account` | Basic account info, key validation |
| `inventories` | Character bags, bank, shared inventory slots |
| `wallet` | Currency balances |
| `unlocks` | Recipes learned, skins unlocked |
| `characters` | Character list and crafting disciplines |

---

## Feature 1: Crafting Profit Calculator

### GW2 API Endpoints Used
- `/v2/account` — validate API key and check permissions
- `/v2/account/inventory` — shared inventory
- `/v2/characters` — list of character names
- `/v2/characters/:id/inventory` — character bags
- `/v2/characters/:id/crafting` — crafting disciplines and levels per character
- `/v2/account/bank` — bank storage
- `/v2/account/wallet` — currencies
- `/v2/account/materials` — material storage
- `/v2/account/recipes` — recipes the account has learned
- `/v2/recipes` — recipe definitions (crafting station recipes only)
- `/v2/items` — item details (including `account_bind_on_use` and `account_bound` flags)
- `/v2/commerce/prices` — TP buy/sell prices (bulk, batched)
- `/v2/legendaryarmory` — legendary item IDs (entry point for goal list)

### Legendary Goals
The app supports **multiple simultaneous legendary goals** — the user can add any number of items from `/v2/legendaryarmory` as active goals. Each goal's dependency tree is resolved independently and stored as a separate GoalProgress row.

The legendary item list is seeded from `/v2/legendaryarmory`, then cross-referenced with `/v2/items` to determine type and name. Initial target: **Endless Summer** (Living World Season 3 legendary ring). Eventually two rings are planned, but the system is fully generic — any legendary item from the armory can be added as a goal.

Mystic Forge steps in any goal's dependency tree fall back to `data/mystic-forge-recipes.json`.

### User Flow
1. User sets their GW2 API key once (stored server-side, never returned to client). App validates key permissions and shows specific missing-permission errors.
2. User selects which characters to include in inventory calculations from the Characters panel (stored in `Settings` as `characterFilter`). Defaults to all characters; deselect characters with irrelevant inventories.
3. User manages active legendary goals from the Goals panel — add any item from `/v2/legendaryarmory`, remove goals when complete. No limit on number of active goals.
4. App fetches inventory for selected characters only: bags, bank, material storage, wallet, learned recipes, and crafting disciplines.
5. App resolves dependency trees for all active goals (`POST /api/v1/crafting/goals/resolve`). Each goal gets its own GoalProgress snapshot with `resolvedAt` timestamp.
6. App walks all trees bottom-up and sums required materials across all active goals. `overage = holdings - totalRequired(across all goals)`. Only positive overages are available for profit crafting.
7. User refreshes TP prices on demand. UI shows "Prices last updated: X ago."
8. App computes profit for all craftable recipes — filtered by available disciplines, minus exclusion list — presents ranked table.
9. Overage materials reduce `crafting_cost` (their effective cost = 0).

### Crafting Discipline Filtering
GW2 recipes belong to a crafting discipline (Weaponsmith, Armorsmith, Jeweler, Tailor, Leatherworker, Artificer, Huntsman, Chef, Scribe). A recipe is only craftable if at least one character has the required discipline at sufficient level.

- Fetch disciplines via `GET /v2/characters/:id/crafting` for all characters
- Build a map of `{ discipline → maxLevel }` across all characters
- Filter the craftable recipe list to only include recipes where the required discipline and level are met
- Show discipline as an additional column in the results table ("Weaponsmith 400")

A recipe marked `Learned` but belonging to an unleveled discipline is excluded from the profit table — the user cannot craft it.

### Dependency Graph Resolution

Materials are modeled as a DAG where leaf nodes are raw materials/currencies and the root is the legendary ring.

**Multi-goal overage example:** The user has two active goals. Goal A requires 10 Mithril Ingots; Goal B requires 8 Mithril Ingots. Total reserved = 18. Player holds 25. Overage = 7. These 7 ingots are available for profitable crafting. If two profitable recipes both use Mithril Ingots, the overage is allocated greedily — highest-profit recipe gets first claim. Surplus at one node does not reduce requirements at sibling nodes.

With a single active goal the behaviour is identical — the multi-goal path degenerates cleanly to the single-goal case.

**Currency modeling:** Gold is the unit of cost, not a DAG node. Non-gold currencies modeled as DAG nodes with conversion edges defined in `data/currency-conversions.json`:

| Currency | Conversion target | Direction |
|----------|------------------|-----------|
| Mystic Coins | Mystic Forge inputs | per recipe in mystic-forge-recipes.json |
| Spirit Shards | Philosopher's Stone | one-way (Mystic Forge) |
| Laurels | Specific vendor items | one-way |
| Karma | Specific vendor items | one-way |

### Account-Bound Materials
Some materials are account-bound (`account_bind_on_use` or `account_bound` flag in `/v2/items`) and cannot be purchased from the TP. These are handled as follows:
- In the **dependency tree**: account-bound materials show current holdings only; no TP buy price is assigned. If holdings are insufficient, the shortfall is flagged as "Must farm — cannot buy."
- In the **profit table**: recipes that require account-bound materials the user does not have enough of are flagged with a warning icon rather than excluded entirely.

### Daily Craft Limits
Some profitable items have daily or weekly production caps (e.g., Charged Quartz Crystals: 1/day). These are defined in `data/craft-limits.json`. In the profit table:
- A "Daily cap: N" badge is shown on affected items
- The profit column reflects a single craft, not unlimited throughput
- Items with daily caps are not ranked above uncapped items of similar per-craft profit

`data/craft-limits.json` schema:
```json
{
  "lastVerified": "2026-03-21",
  "limits": [
    { "itemId": 43772, "itemName": "Charged Quartz Crystal", "dailyCap": 1, "resetType": "daily" }
  ]
}
```

### Exclusion List
- JSON string in `Settings` table (row: `exclusionList`), per user
- Persistent UI panel: add/remove items by name or ID search
- Applied as filter before profit ranking is rendered

### Profit Calculation
```
profit = sell_price - ceil(sell_price * 0.05) - ceil(sell_price * 0.10) - crafting_cost
```
- Listing fee (5%): paid upfront, non-refundable
- Exchange fee (10%): deducted from sale proceeds
- `crafting_cost`: overage materials cost 0; account-bound shortfalls flagged; remaining materials at TP buy-order price

**Craftable recipe list** includes:
- All recipes from `/v2/account/recipes` where the required discipline + level is met by at least one character
- Recipes from `/v2/recipes` whose recipe item is TP-tradeable, where discipline is met
- All entries in `data/vendor-recipes.json` where discipline is met

Only recipes whose output is tradeable (has a `/v2/commerce/prices` entry) are included.

**Results table columns:**

| Column | Description |
|--------|-------------|
| Item | Name + icon |
| Crafting Cost | Gold cost after overage adjustment |
| Sell Price | Current TP sell listing price |
| Profit | Net after both TP fees |
| Discipline | Required discipline and level |
| Daily Cap | Badge if item has a production limit |
| Source | `Learned` / `TP Recipe` / `Vendor Recipe` |
| Exclude | Toggle to add/remove from exclusion list |

---

## Feature 2: Skin Collection Tracker

### GW2 API Endpoints Used
- `/v2/account/skins` — skin IDs unlocked on account
- `/v2/skins` — full skin catalog (bulk, cached in SkinCache table)
- `/v2/commerce/prices` — check if skin unlock item is TP-tradeable
- `/v2/achievements` — cross-reference achievement-gated skins

### Skin Catalog Caching Strategy
`/v2/skins` returns ~90,000+ skin IDs. The full catalog is cached in the `SkinCache` Table Storage table with a 24-hour TTL. On cache miss: fetch all IDs, then fetch metadata in batches of 200 (max 5 concurrent). Manual "Refresh Skin Catalog" button available. Progress indicator shown during initial fetch (can take several minutes).

### User Flow
1. Load skin catalog from SkinCache (or fetch if stale)
2. Fetch account's unlocked skin IDs
3. Diff: unowned = catalog minus account skins
4. Categorize each unowned skin by acquisition method
5. Apply user priority rules
6. Display as filterable, sortable table

### Acquisition Method Categories

| Method | How determined |
|--------|---------------|
| `trading_post` | Unlock item has listing in `/v2/commerce/prices` |
| `achievement` | Cross-referenced via `/v2/achievements` |
| `direct_buy` | Listed in `data/vendor-recipes.json` |
| `gem_store` | Listed in `data/skin-sources.json` |
| `content_drop` | Listed in `data/skin-sources.json` |
| `unknown` | No data available — wiki URL provided as fallback |

**Achievement cross-referencing:** `/v2/achievements` returns reward lists that may reference skin IDs. Match on `rewards[].type == "Skin"` and `rewards[].id == skinId`. Not all achievement-gated skins are discoverable this way — `data/skin-sources.json` supplements gaps.

### Priority Rules
- JSON string in `Settings` table (row: `priorityRules`), per user
- Ordered conditions, first match wins
- UI: drag-and-drop rule editor with condition builder (method, cost threshold, skin type)

---

## Data Flow: TP Price Refresh

```
POST /api/v1/crafting/refresh-prices
  → Build item ID list from GoalProgress snapshot + craftable recipe list
  → Fetch /v2/commerce/prices in batches of 200 (max 5 concurrent, retry on 429/503)
  → Write to PriceCache (partition: "shared", row: itemId,
      fields: buyPrice, sellPrice, cachedAt)
  → Return { updatedAt, count }
  → UI shows "Prices last updated: X minutes ago"
```

---

## Azure Cost Management

Azure Cost Management alerts must be configured as part of initial infrastructure setup. This is not application code but is a required infrastructure deliverable.

| Alert type | Threshold | Action |
|-----------|-----------|--------|
| Budget warning | $75/month (50% of $150 credit) | Email notification |
| Budget critical | $120/month (80% of $150 credit) | Email notification |
| Weekly cost digest | Every Monday | Scheduled cost report via Azure Cost Management |

**Note on MSDN subscription:** Azure suspends services (not charge a card) when the monthly credit is exhausted. Alerts provide early warning before suspension causes downtime. At the expected cost of ~$10–13/month there is ample headroom; alerts exist to catch unexpected resource misconfiguration.

Setup steps are detailed in the implementation plan, not here.

---

## Multi-Account & Auth Future Path

- All Table Storage reads/writes use `userId` partition key from `getRequestUser()`
- Price cache and skin catalog cache use `"shared"` partition
- Frontend `user` object threaded through all components
- **SWA tier note:** Custom authentication (Azure AD B2C / NextAuth) requires SWA Standard tier (~$9/month). Free tier supports only SWA built-in auth providers.

### Mobile App Path
- All features exposed via versioned REST API routes (`/api/v1/`)
- Version prefix enables non-breaking mobile client updates
- React Native / Expo (preferred) or Swift consumes same endpoints
- If React Native: `/packages/core` for shared types and API client
- Auth tokens (JWT) work for both web and mobile consumers

---

## Security Notes

- GW2 API key stored server-side only — never returned to client or logged
- All GW2 API calls proxied through API routes
- `getRequestUser()` stub is the single auth seam
- API key permissions validated on entry — specific missing-permission errors shown
- **Future:** full security audit before multi-user rollout; review ArenaNet API ToS before public launch

---

## Static Data Files

All files include a top-level `lastVerified` field. Update this date after verifying accuracy following major GW2 patches.

| File | Purpose | Schema hint |
|------|---------|-------------|
| `data/mystic-forge-recipes.json` | Mystic Forge recipes (not in GW2 API) | `{ lastVerified, recipes: [{ inputs: [{itemId, count}], output: {itemId, count} }] }` |
| `data/currency-conversions.json` | Currency → item conversion ratios | `{ lastVerified, conversions: [{ currencyId, currencyName, outputItemId, outputItemName, ratio, context }] }` |
| `data/skin-sources.json` | Supplementary skin acquisition metadata | `{ lastVerified, skins: [{ skinId, method, notes }] }` |
| `data/vendor-recipes.json` | NPC vendor recipe and skin listings | `{ lastVerified, vendors: [{ itemId, vendorName, cost, costCurrencyId }] }` |
| `data/craft-limits.json` | Daily/weekly crafting production caps | `{ lastVerified, limits: [{ itemId, itemName, dailyCap, resetType }] }` |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js **14.x** (App Router), React, TypeScript |
| Backend | Next.js API Routes (`/api/v1/`) → Azure Functions **v4 runtime** |
| Runtime | **Node.js 22** (Node 20 support ends April 2026; start on 22) |
| Persistence | Azure Table Storage |
| Local dev emulation | Azurite |
| Hosting | Azure Static Web Apps (Free tier; Standard tier needed for custom auth) |
| Dev tooling | ESLint, Prettier |
| Testing | Jest (unit + GW2 API fixtures in `/fixtures/gw2/`), Playwright (e2e) |
| Future mobile | React Native / Expo (preferred) or Swift |

---

## Out of Scope (Future Milestones)

- Real authentication (Azure AD B2C / NextAuth) — requires SWA Standard tier
- Multi-user support
- Security audit (before multi-user or public launch)
- ArenaNet Fan Content Policy review (before public launch at geekyonion.com)
- iOS / iPad app
- Profit/Hour estimation
- CI/CD pipeline via GitHub Actions
- Wiki scraping automation
- Notifications / alerts for price thresholds
- GW2 API response fixture library for testing (`/fixtures/gw2/`)
