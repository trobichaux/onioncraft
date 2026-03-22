# OnionCraft Security Review

_Generated: 2026-03-22_

## OWASP Top 10 Assessment

### A01: Broken Access Control — ✅ Mitigated
- All routes call `getRequestUser()` as first action
- Table Storage uses `userId` as partition key — data isolation enforced
- API key never returned to client in any response

### A02: Cryptographic Failures — ⚠️ Partial
- API keys stored as plaintext in Table Storage (acceptable for MVP — keys are user-provided GW2 tokens, not passwords)
- HTTPS enforced via HSTS header
- Recommendation: encrypt API keys at rest in future

### A03: Injection — ✅ Mitigated
- All inputs validated with Zod schemas
- Table Storage queries use parameterized partition/row keys
- No raw SQL or string concatenation in queries

### A04: Insecure Design — ✅ Mitigated
- Auth seam (`getRequestUser`) is single point of enforcement
- Rate limiting on user-facing endpoints
- Circuit breaker prevents cascade failures

### A05: Security Misconfiguration — ✅ Mitigated
- CSP headers configured
- HSTS with preload
- X-Frame-Options DENY
- Permissions-Policy restricts unnecessary APIs
- No verbose error messages in production responses

### A06: Vulnerable Components — ✅ Automated
- CodeQL scanning on PRs and weekly schedule
- Dependency review on PRs
- npm audit in CI pipeline

### A07: Auth Failures — ⚠️ Partial (by design)
- Current auth is a stub (single-user MVP)
- GW2 API key validated against tokeninfo on entry
- Expired/invalid keys detected and marked
- Recommendation: implement Azure AD B2C before multi-user launch

### A08: Software/Data Integrity — ✅ Mitigated
- GitHub Actions pinned to commit SHAs
- npm ci with lockfile verification
- No unsafe deserialization

### A09: Logging/Monitoring — ✅ Implemented
- Structured JSON logger (`lib/logger.ts`) outputs to stdout/stderr (captured by Azure SWA)
- All API route handlers wrapped in try/catch with `logger.error()` on failures
- Log entries include: timestamp, level, message, userId, error context
- API keys never logged (enforced by code convention)
- Recommendation: add Application Insights in production for aggregation and alerting

### A10: SSRF — ✅ Mitigated
- GW2 API proxy validates endpoint paths
- Only proxies to known GW2 API base URL
- No user-controlled URLs in server-side fetches
