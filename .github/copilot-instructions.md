# OnionCraft — Copilot Instructions

## Project Overview

OnionCraft is a Guild Wars 2 crafting profit calculator and skin collection tracker. It's a personal-use web app hosted at geekyonion.com.

**Stack:** Next.js 14.x (App Router) · Azure Static Web Apps · Azure Table Storage · TypeScript · Node.js 22

**Design spec:** `docs/superpowers/specs/2026-03-21-gw2-planner-design.md`

## Build & Run

```bash
npm install

# Local dev (requires Azurite running separately)
azurite --silent --tableHost 127.0.0.1
swa start                    # NOT next dev — SWA CLI is required for accurate routing

# Tests
npx jest                     # full suite
npx jest path/to/file.test.ts          # single test file
npx jest -t "test name pattern"        # single test by name
npx playwright test                     # e2e tests
npx playwright test path/to/spec.ts    # single e2e spec

# Lint
npx eslint .
npx prettier --check .
```

**Important:** Always use `swa start` for local development, not `next dev`. The SWA CLI emulates Azure routing behavior — `next dev` alone will miss routing conflicts and API route hijacking.

## Architecture

```
Browser / Future iOS App
         ↕
  Next.js API Routes (/api/v1/ — versioned REST)
  Deployed as Azure Functions via SWA
         ↕                    ↕
  GW2 API (proxied)    Azure Table Storage
                        ├─ Settings (per user)
                        ├─ PriceCache (shared)
                        ├─ GoalProgress (per user)
                        └─ SkinCache (shared)
         ↕
  Static data files (data/*.json)
  Fills GW2 API gaps: Mystic Forge recipes,
  vendor recipes, skin sources, craft limits,
  currency conversions
```

### Auth Stub

Every API route must call `getRequestUser()` from `lib/auth.ts`. This is the single seam for future multi-user support — do not bypass it, and do not remove it until real auth is implemented.

```typescript
// lib/auth.ts — returns { id: "default", name: "You" }
export function getRequestUser(req: NextRequest): User;
```

### Table Storage Schema

All user data is partitioned by `userId`. Caches use `"shared"` partition. Never mix user and shared data in the same partition.

| Table        | Partition Key | Row Key                                                          | Notes                                     |
| ------------ | ------------- | ---------------------------------------------------------------- | ----------------------------------------- |
| Settings     | userId        | `exclusionList` / `priorityRules` / `apiKey` / `characterFilter` | JSON string in `value` prop. Max 64KB.    |
| PriceCache   | `"shared"`    | itemId                                                           | `buyPrice`, `sellPrice`, `cachedAt`       |
| GoalProgress | userId        | goalId (legendary item ID)                                       | One row per active goal. JSON in `value`. |
| SkinCache    | `"shared"`    | skinId                                                           | 24-hour TTL                               |

### Recipe Tree Pattern

Dependency graph resolution is split into two pure functions (following [gw2efficiency/recipe-nesting](https://github.com/gw2efficiency/recipe-nesting)):

1. `buildRecipeTree(goalItemId)` — constructs the DAG. Pure, cacheable.
2. `calculateOverages(trees[], inventory)` — accepts ALL active goal trees, sums requirements, returns per-item overage. Pure, testable.

Never combine these. Always pass all active goal trees together to `calculateOverages`.

## Key Conventions

### Azure / SWA

- Use `@azure/data-tables` (v12+) for Table Storage. The legacy `azure-storage` package is deprecated.
- `staticwebapp.config.json` is required at project root — dynamic routes will 404 without it. Keep it updated as routes are added.
- SWA intercepts `/api/*` requests. Route rewrites in `staticwebapp.config.json` must clarify ownership between SWA functions and Next.js API routes.
- Environment variables: never use `NEXT_PUBLIC_` for secrets. Connection strings and API keys go in SWA env config (prod) and `.env.local` (local).
- Production auth: use Managed Identity + RBAC for Table Storage, not connection strings.

### GW2 API

- Base URL: `https://api.guildwars2.com/v2`
- Rate limit: ~600 req/min. Batch bulk endpoints at 200 IDs per request, max 5 concurrent. Retry on 429/503 with exponential backoff (up to 3 retries).
- API key is server-side only — never return it to the client or log it.
- Required permissions: `account`, `inventories`, `wallet`, `unlocks`, `characters`. Validate all on key entry with specific missing-permission errors.

### TP Fee Calculation

```typescript
const listingFee = Math.ceil(sellPrice * 0.05);
const exchangeFee = Math.ceil(sellPrice * 0.1);
const profit = sellPrice - listingFee - exchangeFee - craftingCost;
```

Do **not** use `sellPrice * 0.85` — independent rounding produces off-by-one copper errors.

### Multiple Simultaneous Goals

The app supports N active legendary goals. Overage is always computed against the SUM of all active goals:

```
overage(item) = holdings(item) - sum(required(item) across all active goals)
```

Never compute overage against a single goal in isolation.

### Account-Bound Materials

Check `account_bind_on_use` and `account_bound` flags from `/v2/items`. Account-bound materials cannot be bought from the TP — flag as "Must farm" rather than assigning a buy price.

### Static Data Files (`data/`)

These fill gaps in the GW2 API (Mystic Forge recipes, vendor items, skin sources, craft limits, currency conversions). Each file has a `lastVerified` ISO date field — update it after verifying accuracy following GW2 patches. Treat these as a versioned database.

### Crafting Discipline Filtering

A recipe is only craftable if a character has the required discipline at sufficient level. Build a `{ discipline → maxLevel }` map across all characters. Never show a recipe as craftable if the user lacks the discipline.

### Legal

Every page must include this footer disclaimer:

> OnionCraft is an unofficial fan project. Not affiliated with or endorsed by ArenaNet or NCSOFT. ©2010–present ArenaNet, LLC. Guild Wars 2 and all related marks are trademarks of NCSOFT Corporation.

### Version Pinning

- **Next.js:** Pin to 14.x. Do not upgrade without verifying SWA compatibility.
- **Node.js:** Use Node 22. Pin in `package.json` engines and `.nvmrc`.
- **Azure Functions:** Use programming model v4.

### Commits

Use [Conventional Commits](https://www.conventionalcommits.org/) format: `type(scope): description`
