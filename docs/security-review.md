# OnionCraft Security Review — Comprehensive Audit

**Date**: 2025-07-10
**Reviewer**: Security Review Agent
**Scope**: Full repository — all API routes, lib modules, client components, config, dependencies
**Ready for Production**: **Yes** — all critical, high, and medium issues have been resolved
**Critical Issues**: 2 → ✅ Fixed (commit `79ef9f0`)
**High Issues**: 3 → ✅ Fixed (commit `79ef9f0`)
**Medium Issues**: 5 → ✅ Fixed (commit `79ef9f0`)
**Low Issues**: 2

> **Status Update (2026-03-22)**: All Critical, High, and Medium findings have been
> resolved. See commit `79ef9f0` for the comprehensive security fix. Additionally,
> rate limiter scoping was improved in commit `249a67c` to prevent cross-route
> interference.

---

## Priority 1 — Must Fix Before Production ⛔

### CRITICAL-1: Shopping List Route Missing from SWA Auth Config

**OWASP**: A01 — Broken Access Control
**File**: `staticwebapp.config.json`, lines 2–15

The Azure SWA route rules enforce `authenticated` role on four patterns:

```
/api/v1/settings/*
/api/v1/crafting/*
/api/v1/skins/*
/api/v1/gw2/*
```

**`/api/v1/shopping-list` does not match any of these patterns.** In Azure SWA,
unmatched routes default to anonymous access. All five HTTP methods (GET, POST,
PATCH, DELETE) on the shopping list are publicly accessible without
authentication.

Combined with CRITICAL-2 (auth fallback), anonymous users all share the
`userId: 'default'` partition — reading, modifying, and deleting each other's
shopping list data.

**Fix** — add to `staticwebapp.config.json`:
```json
{
  "route": "/api/v1/shopping-list",
  "allowedRoles": ["authenticated"]
}
```

---

### CRITICAL-2: Auth Fallback Returns Shared Default User Instead of Rejecting

**OWASP**: A01 — Broken Access Control
**File**: `lib/auth.ts`, lines 46–49

```typescript
// Local dev fallback (no SWA auth header present)
return { id: 'default', name: 'You' };
```

When the `x-ms-client-principal` header is absent or malformed,
`getRequestUser()` returns a valid user object with `id: 'default'` instead
of returning `null` or throwing. Consequences:

1. Any unauthenticated request that bypasses SWA auth (e.g., CRITICAL-1 above)
   silently succeeds on the `'default'` user partition.
2. All unauthenticated users share the same identity — enabling cross-user data
   access.
3. Defense in depth is violated — the app relies entirely on SWA route rules for
   auth with no server-side enforcement.

**Fix** — return `null` for missing auth and require callers to check:
```typescript
export function getRequestUser(req: NextRequest): User | null {
  const header = req.headers.get('x-ms-client-principal');
  if (!header) return null;
  try {
    const decoded = Buffer.from(header, 'base64').toString('utf-8');
    const principal: ClientPrincipal = JSON.parse(decoded);
    if (principal.userId) {
      return { id: principal.userId, name: principal.userDetails || principal.userId };
    }
  } catch { /* malformed */ }
  return null;
}
```

Then in every route handler:
```typescript
const user = getRequestUser(req);
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
```

---

## Priority 2 — Must Fix 🔴

### HIGH-1: OData Filter Injection in Table Storage Queries

**OWASP**: A03 — Injection
**File**: `lib/tableStorage.ts`, lines 218, 348, 427

Three functions construct OData filters via raw string interpolation:

```typescript
// Line 218 — getGoals()
queryOptions: { filter: `PartitionKey eq '${userId}'` }

// Line 348 — getShoppingList()
queryOptions: { filter: `PartitionKey eq '${userId}'` }

// Line 427 — clearShoppingList()
queryOptions: { filter: `PartitionKey eq '${userId}'` }
```

If `userId` contains a single quote, it breaks the OData filter syntax and can
alter query semantics (e.g., `' or PartitionKey ne '`). While Azure SWA-
provided userIds are GUIDs, defense in depth requires parameterized queries.

> The previous review incorrectly stated "Table Storage queries use
> parameterized partition/row keys" — these three queries do not.

**Fix** — use the SDK's `odata` tagged template literal:
```typescript
import { odata } from '@azure/data-tables';
queryOptions: { filter: odata`PartitionKey eq ${userId}` }
```

---

### HIGH-2: GW2 API Proxy Has No Endpoint Allowlist

**OWASP**: A10 — SSRF / Proxy Abuse
**File**: `app/api/v1/gw2/[...path]/route.ts`, lines 16–26

```typescript
const endpoint = '/' + params.path.join('/');
const data = await client.get<unknown>(endpoint, ...);
```

This route accepts **any** path segments and forwards them to the GW2 API.

- Open proxy abuse: attackers can use this at scale, consuming server resources
  and risking IP-level bans from ArenaNet.
- No rate limiting on this route.
- All incoming query parameters are forwarded unfiltered.

> The previous review incorrectly stated "GW2 API proxy validates endpoint
> paths" — no validation exists.

**Fix** — implement an allowlist:
```typescript
const ALLOWED_PREFIXES = ['/items', '/recipes', '/commerce/prices', '/skins'];

const endpoint = '/' + params.path.join('/');
if (!ALLOWED_PREFIXES.some(p => endpoint.startsWith(p))) {
  return NextResponse.json({ error: 'Endpoint not allowed' }, { status: 403 });
}
```

---

### HIGH-3: No Rate Limiting on Expensive Routes

**OWASP**: A04 — Insecure Design
**Files**: 8 route handlers

Routes that make expensive GW2 API calls or heavy storage operations but
have **no** `checkRateLimit()` call:

| Route | File |
|-------|------|
| `GET /api/v1/gw2/*` | `app/api/v1/gw2/[...path]/route.ts` |
| `GET /api/v1/crafting/profit` | `app/api/v1/crafting/profit/route.ts` |
| `POST /api/v1/crafting/refresh-prices` | `app/api/v1/crafting/refresh-prices/route.ts` |
| `GET/POST/DELETE /api/v1/crafting/goals` | `app/api/v1/crafting/goals/route.ts` |
| `GET /api/v1/skins/collection` | `app/api/v1/skins/collection/route.ts` |
| `POST /skins/collection/refresh` | `app/api/v1/skins/collection/refresh/route.ts` |
| `POST /skins/collection/check` | `app/api/v1/skins/collection/check/route.ts` |
| `POST /skins/catalog/refresh` | `app/api/v1/skins/catalog/refresh/route.ts` |

Also: `GET /api/v1/shopping-list` has no rate limiting (only POST/PATCH/DELETE do).

> The previous review stated "Rate limiting on user-facing endpoints" — this is
> only true for settings and some shopping-list methods.

**Fix** — add `checkRateLimit(user.id)` to every route. Use stricter limits for
heavy operations:
```typescript
checkRateLimit(user.id, { maxRequests: 5, windowMs: 300_000 }); // 5 per 5 min
```

---

## Priority 3 — Should Fix 🟡

### MEDIUM-1: CSP Allows `unsafe-eval` in Script Sources

**OWASP**: A05 — Security Misconfiguration
**File**: `staticwebapp.config.json`, line 35

```
script-src 'self' 'unsafe-inline' 'unsafe-eval'
```

`'unsafe-eval'` permits `eval()`, `Function()`, etc., significantly weakening
XSS protection. Next.js production builds do **not** require `'unsafe-eval'`.

**Fix**: `script-src 'self' 'unsafe-inline'`

---

### MEDIUM-2: TokenBucketRateLimiter Can Hang Requests Indefinitely

**File**: `lib/resilience/rateLimiter.ts`, lines 54–59

```typescript
async acquire(): Promise<void> {
  if (this.tryAcquire()) return;
  return new Promise<void>((resolve) => {
    this.waiters.push(resolve);
  });
}
```

When the bucket is empty, `acquire()` creates a promise pushed to a waiter
queue. `drainWaiters()` is only called in tests — never in production. Queued
requests hang forever (denial of service).

**Fix** — add a timeout to `acquire()`:
```typescript
async acquire(timeoutMs = 10_000): Promise<void> {
  if (this.tryAcquire()) return;
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = this.waiters.indexOf(waiterResolve);
      if (idx >= 0) this.waiters.splice(idx, 1);
      reject(new Error('Rate limiter timeout'));
    }, timeoutMs);
    const waiterResolve = () => { clearTimeout(timer); resolve(); };
    this.waiters.push(waiterResolve);
  });
}
```

---

### MEDIUM-3: No Timeout on GW2 API Fetch Calls

**File**: `lib/gw2Client.ts`, line 145

```typescript
const response = await fetch(url.toString(), { headers });
```

No timeout configured. If the GW2 API is unresponsive, requests hang until the
serverless function timeout (30–240s), tying up resources.

**Fix**:
```typescript
const response = await fetch(url.toString(), {
  headers,
  signal: AbortSignal.timeout(15_000),
});
```

---

### MEDIUM-4: In-Memory Rate Limiter Ineffective in Serverless

**File**: `lib/rateLimit.ts`

The sliding-window rate limiter uses an in-memory `Map`. In Azure SWA:
- Each cold start creates a fresh, empty store.
- Concurrent instances don't share state.
- Rate limits reset on every instance recycle.

**Fix (short-term)**: Document as known limitation and configure SWA platform
rate limiting. **Fix (long-term)**: Use Azure Table Storage or Redis.

---

### MEDIUM-5: API Key Stored Without Application-Level Encryption

**File**: `app/api/v1/settings/api-key/route.ts`, lines 71–78

The GW2 API key is stored as plaintext JSON in Azure Table Storage. While
Azure SSE provides encryption at rest, the key is visible in plaintext to
anyone with storage account access.

**Note (positive)**: The GET endpoint (line 142) correctly does **not** return
the actual key value — only `hasKey`, `permissions`, and `validatedAt`.

---

## Priority 4 — Consider Fixing 🟢

### LOW-1: GW2 API Key Input Not Format-Validated

**File**: `lib/schemas.ts`, line 20

```typescript
key: z.string().min(1)  // no format or length constraints
```

GW2 API keys follow a specific 72-character UUID-like format. Adding a regex
would reject obviously invalid inputs before the `/tokeninfo` network call.

---

### LOW-2: `sanitizeString` Unused — Incomplete XSS Prevention

**File**: `lib/security.ts`, lines 1–9

The `sanitizeString()` function strips HTML tags but doesn't handle HTML
entities, event handlers, or CSS injection. However, it is not currently
called by any route handler — all input validation uses Zod schemas instead.
Since React auto-escapes JSX output, the actual XSS risk is minimal. This
is informational.

---

## Positive Findings ✅

1. **API key never sent to client** — GET `/settings/api-key` returns only
   `hasKey`, `permissions`, `validatedAt` (line 142–146).
2. **GW2 proxy doesn't use stored API keys** — the `[...path]` proxy creates
   `new Gw2Client()` without a key (line 7); stored keys are only retrieved
   in routes that need them.
3. **API key input uses `type="password"`** — `ApiKeyForm.tsx` line 151.
4. **Strong security headers** — HSTS with preload, X-Frame-Options DENY,
   frame-ancestors 'none', nosniff, strict referrer policy, COOP.
5. **Zod schema validation on all write endpoints**.
6. **Character names URI-encoded** — `inventory.ts` line 75.
7. **Unused auth providers disabled** — Twitter and AAD return 404.
8. **`.env` files gitignored** — `.env`, `.env.local`, `.env.*.local`.
9. **No hardcoded secrets** — `.env.local.example` contains only the well-known
   Azurite emulator connection string.
10. **Error responses don't leak internals** — generic messages to clients,
    details only in server logs.
11. **Circuit breaker and retry patterns** implemented correctly.
12. **64KB size limit** enforced on settings writes (`tableStorage.ts` line 105).
13. **Cyclic recipe detection** — `recipeTree.ts` line 114 uses a `visited` set.

---

## Dependencies Assessment

| Package | Version | Status |
|---------|---------|--------|
| `next` | ^14.2.28 | ✅ Latest 14.x |
| `@azure/data-tables` | ^13.3.0 | ✅ Current |
| `zod` | ^3.24.0 | ✅ Current |
| `react` / `react-dom` | ^18.3.1 | ✅ Current |

Minimal dependency footprint (4 runtime deps) reduces supply chain risk.
Run `npm audit` regularly.

---

## Action Summary

| # | Finding | Severity | Effort | Fix Location |
|---|---------|----------|--------|--------------|
| C1 | Shopping list auth missing | **Critical** | 5 min | `staticwebapp.config.json` |
| C2 | Auth fallback → shared user | **Critical** | 30 min | `lib/auth.ts` + all route files |
| H1 | OData filter injection | **High** | 15 min | `lib/tableStorage.ts` |
| H2 | GW2 proxy no allowlist | **High** | 20 min | `app/api/v1/gw2/[...path]/route.ts` |
| H3 | Missing rate limiting | **High** | 45 min | 8 route files |
| M1 | CSP `unsafe-eval` | Medium | 5 min | `staticwebapp.config.json` |
| M2 | Token bucket hangs | Medium | 20 min | `lib/resilience/rateLimiter.ts` |
| M3 | No fetch timeout | Medium | 5 min | `lib/gw2Client.ts` |
| M4 | In-memory rate limiter | Medium | Document | `lib/rateLimit.ts` |
| M5 | API key plaintext | Medium | 1 hr | `settings/api-key/route.ts` |

---

## OWASP Top 10 Reassessment

| Category | Previous | Actual | Key Finding |
|----------|----------|--------|-------------|
| A01: Broken Access Control | ✅ Mitigated | ⛔ **Critical** | Shopping list unprotected; auth fallback shares identity |
| A02: Cryptographic Failures | ⚠️ Partial | ⚠️ Partial | API key plaintext (unchanged) |
| A03: Injection | ✅ Mitigated | 🔴 **High** | 3 OData filter injection points |
| A04: Insecure Design | ✅ Mitigated | 🔴 **High** | 8 routes missing rate limiting |
| A05: Security Misconfiguration | ✅ Mitigated | 🟡 Medium | CSP `unsafe-eval` unnecessary |
| A06: Vulnerable Components | ✅ Automated | ✅ OK | Dependencies current |
| A07: Auth Failures | ⚠️ Partial | ⛔ **Critical** | No server-side auth enforcement |
| A08: Software/Data Integrity | ✅ Mitigated | ✅ OK | No changes |
| A09: Logging/Monitoring | ✅ Implemented | ✅ OK | No changes |
| A10: SSRF | ✅ Mitigated | 🔴 **High** | GW2 proxy has no endpoint allowlist |
