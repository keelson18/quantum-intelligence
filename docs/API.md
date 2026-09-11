# API reference

Two surfaces exist. App-internal calls are typed RPC server functions; external
callers use HTTP routes under `/api/public/*`.

## Server functions (authenticated RPC)

All of these require a valid session; the bearer token is attached
automatically by client middleware and validated server-side by
`requireSupabaseAuth`. Input is validated with Zod, output is a plain DTO.
Rate limits are per user and action, enforced in the database
(`rate_limit_events`).

| Function | Module | Input | Limit | Notes |
| --- | --- | --- | --- | --- |
| `predictML` | `lib/ai.functions.ts` | `{ symbol, timeframe }` | 30/min | Model inference |
| `retrainML` | `lib/ai.functions.ts` | `{ symbol, timeframe }` | 2/min | Expensive; tight limit |
| `getNews` | `lib/ai.functions.ts` | – | 60/min | Public market news |
| `askCoachFn` | `lib/ai.functions.ts` | `{ question, context }` | 20/min | Narrative only; never authorises execution |
| `persistAnalysisRun` | `lib/intelligence.functions.ts` | analysis-run envelope | – | Writes audit trail |
| `claimDefaultRole` | `lib/roles.functions.ts` | – | – | Assigns non-privileged default role |

Errors surface as thrown errors mapped to route error boundaries; provider
details are logged server-side and never returned to the client.

## HTTP routes

### `GET /api/public/health`

Liveness plus dependency probe. Unauthenticated by design, returns no PII.

```json
{
  "status": "ok",
  "checks": { "runtime": "ok", "database": "ok" },
  "revision": "a1b2c3d",
  "latency_ms": 42,
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

`200` healthy, `503` degraded. `cache-control: no-store`.

## Security controls on every endpoint

- Authentication: bearer token validated server-side; route guards are UX only.
- Authorization: role checks via the `has_role` security-definer function; RLS
  scopes rows to `auth.uid()` (IDOR-resistant by construction).
- Input validation: Zod schemas with explicit `max()` bounds — no mass
  assignment, handlers whitelist the fields they persist.
- SQL injection: parameterised query builder only; no string-concatenated SQL.
- CSRF: `createCsrfMiddleware` on all server functions.
- SSRF: outbound hosts come from configuration, never from user input.
- Rate limiting and structured audit logging on all AI/ML endpoints.
