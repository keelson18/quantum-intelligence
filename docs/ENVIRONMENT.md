# Environment variables

No endpoint, key, model name or execution assumption is hardcoded in source.
Client-visible values are read through `src/config/env.ts`; server-only values
through `src/config/env.server.ts` (always inside request handlers, never at
module scope, because the edge runtime injects env per request).

Copy `.env.example` to `.env` and fill it in. `.env` is git-ignored; only
`.env.example` (placeholders) is committed.

## Client (inlined into the browser bundle at build time — never secret)

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | yes | Backend API origin |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | yes | Publishable (anon) key; RLS enforced |
| `VITE_SUPABASE_PROJECT_ID` | yes | Backend project identifier |
| `VITE_MARKET_REST_URL` | yes | Market-data REST base |
| `VITE_MARKET_WS_URL` | yes | Market-data websocket base |
| `VITE_MARKET_HISTORY_LIMIT` | no (1000) | Candles per history request |
| `VITE_PAPER_FEE_RATE` | no (0.001) | Simulated taker fee per leg |
| `VITE_PAPER_SLIPPAGE_RATE` | no (0.0005) | Simulated adverse slippage |
| `VITE_LOG_LEVEL` | no (`info`) | Client log threshold |

## Server (never exposed to the browser)

| Variable | Required | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | yes | Backend origin for server functions |
| `SUPABASE_PUBLISHABLE_KEY` | yes | Publishable key for user-scoped/public reads |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Privileged writes only (`client.server.ts`) |
| `MARKET_REST_URL` | yes | Server-side market-data REST base |
| `MARKET_WS_URL` | no | Allowed websocket origin in the CSP |
| `AI_GATEWAY_URL` | yes | AI gateway chat-completions endpoint |
| `AI_COACH_MODEL` | yes | Coach model identifier |
| `NEWS_SOURCE_BASE_URL` | yes | News ingestion source |
| `LOG_LEVEL` | no (`info`) | Server log threshold |
| `SECURITY_FRAME_ANCESTORS` | no | CSP `frame-ancestors` allow-list |
| `BUILD_REVISION` | no | Commit SHA reported by the health endpoint |

## Rules

- Never prefix a secret with `VITE_`; that publishes it to every browser.
- Read `process.env` inside handlers only.
- Rotate the service-role key if it is ever printed, logged or committed.
