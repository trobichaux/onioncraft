# OnionCraft — Claude Code Instructions

## Project Overview

**OnionCraft** (`github.com/trobichaux/onioncraft`) is a Guild Wars 2 planning web app for crafting profit analysis and skin collection tracking. Hosted at `geekyonion.com`.

Built with: **Next.js 14+ (App Router) · Azure Static Web Apps · Azure Table Storage · TypeScript**

Design spec: `docs/superpowers/specs/2026-03-21-gw2-planner-design.md`

This file defines how Claude should approach work in this repo, including which agents to spawn, Azure-specific conventions, and GW2 API context.

---

## Model Selection by Task

When spawning agents, match the model to the task complexity:

| Task Type | Model | Rationale |
|-----------|-------|-----------|
| Architecture planning, complex reasoning | `claude-opus-4-6` | Highest reasoning; worth the cost for decisions that shape the whole system |
| Feature implementation, refactoring | `claude-sonnet-4-6` | Best balance of speed, cost, and coding quality |
| Repetitive codegen, boilerplate, file renaming | `claude-haiku-4-5-20251001` | Fast and cheap for mechanical tasks |
| Research, API exploration, docs lookup | `claude-sonnet-4-6` | Good at synthesizing external information |
| Test writing | `claude-haiku-4-5-20251001` | Tests are formulaic; Haiku handles them well |
| Code review, security audit | `claude-opus-4-6` | Needs deep understanding to catch subtle issues |

Always pass `model` explicitly when invoking an agent so the override takes effect.

---

## Agent Roles & When to Spawn Them

### Planner Agent (Opus)
Use when: designing a new feature, deciding between architectural approaches, or scoping a large task.

```
Agent tool — subagent_type: "Plan", model: "opus"
Prompt: "Design the architecture for [feature]. Return a step-by-step implementation plan, identify the files to create or modify, and note trade-offs."
```

### Implementer Agent (Sonnet)
Use when: writing or modifying application code after a plan exists.

```
Agent tool — subagent_type: "general-purpose", model: "sonnet"
Prompt: "Implement [feature] according to this plan: [plan]. Write the code, create or edit the relevant files."
```

### Explorer Agent (Sonnet)
Use when: mapping an unfamiliar part of the codebase or researching the GW2 API.

```
Agent tool — subagent_type: "Explore", model: "sonnet"
Prompt: "Explore [area of codebase or API]. Answer: [specific question]. Thoroughness: medium."
```

### Test Writer Agent (Haiku)
Use when: generating unit or integration tests for an already-implemented module.

```
Agent tool — subagent_type: "general-purpose", model: "haiku"
Prompt: "Write tests for [module/function]. Cover happy path, edge cases, and error conditions. Do not change application code."
```

### Boilerplate Agent (Haiku)
Use when: scaffolding new files, generating typed interfaces from a schema, or other mechanical codegen.

```
Agent tool — subagent_type: "general-purpose", model: "haiku"
Prompt: "Generate [boilerplate] following the existing patterns in [reference file]. Output the complete file."
```

### Reviewer Agent (Opus)
Use when: doing a pre-PR code review, auditing security, or validating correctness of a complex algorithm.

```
Agent tool — subagent_type: "general-purpose", model: "opus"
Prompt: "Review the following changes for correctness, security, and code quality. Be specific about any issues found: [diff or file list]."
```

---

## Parallel Agent Execution

When multiple independent workstreams exist, spawn agents in a single message (one `<function_calls>` block with multiple Agent tool calls). The orchestrator pattern below coordinates them.

### Orchestrator Pattern

The orchestrator is Opus (in the main conversation or a dedicated agent) and works like this:

1. **Decompose** — Break the feature into independent subtasks.
2. **Dispatch** — Launch all independent agents in parallel in one message.
3. **Integrate** — Collect results and resolve conflicts before writing final code.
4. **Validate** — Spawn a Reviewer agent on the integrated output.

#### Example: Adding a new "Build Optimizer" feature

```
Step 1 — Orchestrator (Opus) plans:
  - Subtask A: Explore existing build data model (Explore agent, Sonnet)
  - Subtask B: Research GW2 API skill/trait endpoints (Explorer agent, Sonnet)
  - Subtask C: Scaffold TypeScript interfaces for the optimizer (Boilerplate agent, Haiku)

Step 2 — Dispatch all three in a single parallel message.

Step 3 — Orchestrator reads all three results, resolves naming conflicts,
          then dispatches:
  - Subtask D: Implement optimizer logic (Implementer agent, Sonnet)
  - Subtask E: Write optimizer tests (Test Writer agent, Haiku)
  — These can run in parallel because D writes app code and E writes test files
    in separate directories.

Step 4 — Reviewer agent (Opus) audits the combined output.
```

### Rules for Parallel Dispatch

- Agents writing to the **same file** must run sequentially, not in parallel.
- Agents writing to **different files** can run in parallel safely.
- Use `isolation: "worktree"` on the Agent tool when an agent will make many speculative edits that may be discarded.
- Background (`run_in_background: true`) is appropriate for slow research agents when you have other work to do in the foreground.

---

## Azure Conventions & Gotchas

These are hard-won rules for this specific stack. Follow them to avoid hours of debugging.

### Azure Static Web Apps + Next.js App Router

- **Use `@azure/static-web-apps-cli`** (`swa` CLI) for local development — it accurately emulates SWA routing behavior. `next dev` alone will not catch SWA routing conflicts.
- **`/api` routing conflict:** SWA intercepts requests to `/api/*` for its own managed functions. Next.js App Router API routes live at `app/api/` but SWA may hijack them. Always define route rewrites in `staticwebapp.config.json` to clarify ownership.
- **`staticwebapp.config.json` is required** — dynamic routes (e.g. `[id]`, `[[...slug]]`) will 404 in production without explicit entries. Create this file at project root and keep it updated as routes are added.
- **Known SWA + App Router issues:** Dynamic routes with `[param]` segments and route groups `(folder)` have historically caused 500/404 errors on SWA. Always test dynamic routes with `swa start` before deploying.
- **Next.js version:** Pin to a version validated for SWA hybrid deployment. Check [SWA Next.js support docs](https://learn.microsoft.com/en-us/azure/static-web-apps/nextjs) before upgrading Next.js — SWA support lags behind Next.js releases.
- **Environment variables:** Never use `NEXT_PUBLIC_` prefix for secrets. Table Storage connection string and GW2 API key go in SWA environment config (production) and `.env.local` (local dev). `.env.local` is gitignored — never commit it.

### Azure Table Storage

- **Package:** Always use `@azure/data-tables` (v12+). The legacy `azure-storage` npm package is deprecated and must not be used.
- **Local development:** Use [Azurite](https://github.com/Azure/Azurite) to emulate Table Storage locally. Install via npm (`npm install -g azurite`) or Docker. Start with `azurite --silent --tableHost 127.0.0.1`.
- **Azurite connection string** (use in `.env.local`):
  ```
  AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tiqp;TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;"
  ```
- **Entity serialization:** Table Storage properties are flat. Complex objects (exclusion lists, priority rules) are stored as JSON strings in a single `value` property. Max 64KB per entity — enforce this limit in the data access layer.
- **Partition key design:** All user data uses `userId` as partition key. The price cache and skin catalog cache use `"shared"`. Never mix user-scoped and shared data in the same partition.
- **Region co-location:** In production, deploy Table Storage in the same Azure region as the SWA to minimize latency.
- **Authentication in production:** Use Managed Identity + RBAC, not connection strings, for production Table Storage access. Connection strings are acceptable for local dev only.

### Azure Functions (via SWA API Routes)

- **Cold starts:** SWA Consumption plan has notable cold starts for infrequently used apps. For personal use this is acceptable. If latency becomes an issue, upgrade to Flex Consumption plan.
- **Timeout:** Default Azure Functions timeout is 5 minutes on Consumption plan. GW2 API bulk fetches (e.g., full skin catalog) can take time — ensure long-running operations complete within this window or implement pagination/chunking.
- **Stateless:** Functions are stateless. All state lives in Table Storage. Never rely on in-memory state between requests.

---

## GW2 API Reference

Always include this context when prompting agents that touch GW2 data or API.

### Base URL & Auth
- Base: `https://api.guildwars2.com/v2`
- Public endpoints require no auth; account endpoints require `?access_token=<key>` or `Authorization: Bearer <key>` header
- API key is stored server-side only — never pass it from the browser

### Rate Limits
- Approximately 600 requests/minute (not officially documented)
- Bulk endpoints support up to **200 IDs per request** — always batch
- Use max **5 concurrent requests** to stay safely under the limit
- Retry on 429 and 503 with exponential backoff (up to 3 retries)

### Key Endpoints

| Endpoint | Auth | Notes |
|----------|------|-------|
| `/v2/account` | ✓ | Validate API key |
| `/v2/account/inventory` | ✓ | Shared inventory slots |
| `/v2/characters` | ✓ | List of character names |
| `/v2/characters/:id/inventory` | ✓ | Character bag contents |
| `/v2/account/bank` | ✓ | Bank storage |
| `/v2/account/wallet` | ✓ | Currency balances |
| `/v2/account/materials` | ✓ | Material storage tab |
| `/v2/account/recipes` | ✓ | Recipes unlocked on account |
| `/v2/account/skins` | ✓ | Skin IDs unlocked on account |
| `/v2/recipes` | — | Crafting station recipe definitions (bulk, max 200) |
| `/v2/recipes/search?output=<id>` | — | Find recipes by output item |
| `/v2/items` | — | Item details (bulk, max 200) |
| `/v2/skins` | — | Skin catalog (~90k entries; use bulk + cache) |
| `/v2/commerce/prices` | — | TP buy/sell prices (bulk, max 200) |
| `/v2/legendaryarmory` | — | Legendary item IDs and types |
| `/v2/achievements` | — | Achievement details (bulk, max 200) |
| `/v2/currencies` | — | Wallet currency definitions |

### Trading Post Fee Formula
GW2 charges two separate fees — use `ceil()` on each independently:
```typescript
const listingFee = Math.ceil(sellPrice * 0.05);  // paid upfront, non-refundable
const exchangeFee = Math.ceil(sellPrice * 0.10); // deducted from proceeds
const profit = sellPrice - listingFee - exchangeFee - craftingCost;
```
**Do not use `sellPrice * 0.85`** — this produces off-by-one copper errors on nearly every item due to independent rounding.

### Required API Key Permissions
Always validate on key entry that all of these are present — show specific missing-permission errors:

| Permission | Used for |
|-----------|---------|
| `account` | Basic account info, key validation |
| `inventories` | Character bags, bank, shared inventory slots |
| `wallet` | Currency balances |
| `unlocks` | Recipes learned, skins unlocked |
| `characters` | Character list and crafting disciplines |

### Crafting Disciplines
Recipes belong to disciplines (Weaponsmith, Armorsmith, Jeweler, Tailor, Leatherworker, Artificer, Huntsman, Chef, Scribe). Fetch per-character disciplines via `/v2/characters/:id/crafting`. Build a `{ discipline → maxLevel }` map across all characters. **Never show a recipe as craftable if the user lacks the required discipline at sufficient level** — this is a common bug in GW2 crafting tools.

### Account-Bound Materials
Check the `account_bind_on_use` and `account_bound` flags from `/v2/items`. Account-bound materials cannot be bought from the TP — flag them as "Must farm" rather than assigning a TP buy price. Never show a crafting cost that implies you can buy an account-bound material.

### Known API Gaps (use static data files to fill)
- **Mystic Forge recipes** are not in `/v2/recipes` → `data/mystic-forge-recipes.json`
- **NPC vendor recipes/skins** are not reliably in the API → `data/vendor-recipes.json`
- **Skin acquisition methods** (gem store, festival, story) have no API source → `data/skin-sources.json`
- **Currency conversion ratios** (Spirit Shards → Philosopher's Stone, etc.) → `data/currency-conversions.json`
- **Daily/weekly craft production caps** (Charged Quartz Crystal: 1/day, etc.) → `data/craft-limits.json`

### Multiple Simultaneous Goals
The app supports N active legendary goals at once. Each goal is a separate GoalProgress row. **Overage is always computed against the SUM of all active goals.** Never compute overage against a single goal in isolation — it will produce incorrect results when multiple goals are active.

`overage(item) = holdings(item) - sum(required(item) across all active goals)`

The single-goal case is just this formula with one goal in the sum.

### Character Filter
Users select which characters to include in inventory calculations. The selection is stored in `Settings` (row: `characterFilter`) as a JSON array of character names. When fetching inventories, only fetch selected characters. Default = all characters.

### Recipe Tree Pattern (gw2efficiency-inspired)
Split dependency graph resolution into two discrete functions — this is the proven pattern from [gw2efficiency/recipe-nesting](https://github.com/gw2efficiency/recipe-nesting):
1. `buildRecipeTree(goalItemId)` — constructs the DAG from API + static data. Pure, cacheable.
2. `calculateOverages(trees[], inventory)` — accepts an array of trees (one per active goal), walks all bottom-up, sums requirements per item, returns per-item overage map. Pure, testable.

Never combine these into one function. Always pass all active goal trees together to `calculateOverages`.

### Attribute Names (for build-related features)
Power, Precision, Toughness, Vitality, Concentration, Condition Damage, Expertise, Ferocity, Healing Power, Armor, Boon Duration, Critical Chance, Critical Damage, Condition Duration

---

## Project Structure Conventions

```
/app                    # Next.js App Router pages and API routes
  /api
    /crafting           # Profit calc, goal resolution, price refresh
    /skins              # Collection diff, unlock ranking
    /settings           # Exclusion list, priority rules, API key CRUD
    /gw2                # GW2 API proxy (avoids CORS, handles rate limits)
/lib
  auth.ts               # getRequestUser() stub — single auth seam
  tableStorage.ts       # Azure Table Storage client wrapper
  gw2Client.ts          # GW2 API client with retry/batching
/data                   # Static JSON data files (versioned, manually maintained)
  mystic-forge-recipes.json
  currency-conversions.json
  skin-sources.json
  vendor-recipes.json
/docs
  /superpowers/specs    # Design specs
staticwebapp.config.json  # REQUIRED — SWA routing config
```

### Auth Stub (do not remove until real auth is implemented)
```typescript
// lib/auth.ts
export function getRequestUser(req: NextRequest): User {
  // TODO: replace with real auth (Azure AD B2C, NextAuth, etc.)
  return { id: "default", name: "You" };
}
```
Every API route must call `getRequestUser()`. This is the single seam for future multi-user support.

---

## Installed Plugins & Skills

The following plugins are installed and active. Invoke them with the `Skill` tool using the name shown.

### Superpowers Suite
High-signal workflow skills — prefer these over ad-hoc approaches for the tasks they cover.

| Skill | When to invoke |
|-------|---------------|
| `superpowers:using-superpowers` | Start of any new conversation — establishes skill discovery |
| `superpowers:brainstorming` | Before any creative work: new features, components, behavior changes |
| `superpowers:writing-plans` | When given a spec or requirements for a multi-step task, before touching code |
| `superpowers:executing-plans` | When executing a written implementation plan in a separate session |
| `superpowers:subagent-driven-development` | Executing implementation plans with independent tasks in the current session |
| `superpowers:dispatching-parallel-agents` | When 2+ independent tasks can run without shared state or sequential deps |
| `superpowers:test-driven-development` | Before writing implementation code for any feature or bugfix |
| `superpowers:systematic-debugging` | Before proposing fixes for any bug, test failure, or unexpected behavior |
| `superpowers:receiving-code-review` | Before implementing code review suggestions — verify before agreeing |
| `superpowers:requesting-code-review` | After completing tasks or major features, before merging |
| `superpowers:verification-before-completion` | Before claiming work is complete — run verification commands, evidence first |
| `superpowers:finishing-a-development-branch` | When implementation is done, tests pass, and you need to decide how to integrate |
| `superpowers:using-git-worktrees` | Before feature work that needs isolation from the current workspace |
| `superpowers:writing-skills` | When creating or improving skills |

### Code Review
| Skill | When to invoke |
|-------|---------------|
| `code-review:code-review` | Review a pull request — use instead of manual diff reading |

### Feature Development
| Skill | When to invoke |
|-------|---------------|
| `feature-dev:feature-dev` | Guided feature development with deep codebase understanding and architecture focus |

### Frontend Design
| Skill | When to invoke |
|-------|---------------|
| `frontend-design:frontend-design` | Build web components, pages, or UI — produces polished, production-grade output |

### CLAUDE.md Management
| Skill | When to invoke |
|-------|---------------|
| `claude-md-management:revise-claude-md` | After a session — capture learnings and update this file |
| `claude-md-management:claude-md-improver` | Audit and improve CLAUDE.md quality across the repo |

### Skill Creator
| Skill | When to invoke |
|-------|---------------|
| `skill-creator:skill-creator` | Create new skills, modify existing ones, or benchmark skill performance |

### Ralph Loop
| Skill | When to invoke |
|-------|---------------|
| `ralph-loop:ralph-loop` | Start an autonomous looping session |
| `ralph-loop:cancel-ralph` | Cancel an active Ralph Loop |
| `ralph-loop:help` | Explain Ralph Loop and available commands |

### Built-in Skills (non-plugin)
| Skill | When to invoke |
|-------|---------------|
| `claude-api` | When building with the Anthropic SDK or Claude API |
| `simplify` | After a logical chunk of code is written — review and refine |
| `loop` | Set up a recurring task or polling interval |
| `update-config` | Modify `settings.json`, hooks, permissions, or env vars |

---

## Legal Requirements

**Every page in the app must include the following disclaimer in the footer — no exceptions:**

> OnionCraft is an unofficial fan project. Not affiliated with or endorsed by ArenaNet or NCSOFT. ©2010–present ArenaNet, LLC. Guild Wars 2 and all related marks are trademarks of NCSOFT Corporation.

Full disclaimer text and API usage policy: `DISCLAIMER.md`

When building any frontend page or shared layout component, verify the footer disclaimer is present. Do not ship a layout without it.

---

## General Conventions

- Always read files before editing them.
- Prefer editing existing files over creating new ones.
- Keep solutions minimal — no speculative abstractions or features beyond what is asked.
- Do not commit unless explicitly asked.
- When uncertain about scope, ask before spawning a large parallel workload.
- Run `swa start` (not just `next dev`) when testing anything related to routing or API routes.
- **Node.js version:** Always use Node 22. Node 20 support in Azure Functions ends April 2026. Pin in `package.json` engines field and `.nvmrc`.
- **Next.js version:** Pin to 14.x. Do not upgrade to 15.x without first verifying SWA compatibility.
- **Azure Functions runtime:** Use programming model v4 (required for Node 22).
- Static data files in `data/` are the source of truth for Mystic Forge and vendor data — treat them like a versioned database, not throwaway config.
