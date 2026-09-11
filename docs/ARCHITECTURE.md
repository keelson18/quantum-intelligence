# Architecture

## Tiers

```text
UI (routes, pages, components)
  -> application services (orchestration: paperTrading, intelligenceClient, mlClient)
    -> domain (pure logic: 19 engines, indicators, execution simulation, risk gate)
      -> data access (repositories in src/lib/data/*.repo.ts, market providers)
        -> infrastructure (Postgres + RLS, market feed, AI gateway)
```

Rules enforced by review:

- Components never import the database client; they call repositories or
  application services.
- Domain modules are pure — no I/O, no env reads, no persistence — so they are
  unit-testable in isolation (`src/lib/execution/simulation.test.ts`,
  `src/lib/engines/masterDecision.test.ts`).
- Providers are swapped through the `MarketDataProvider` interface
  (`src/lib/market/provider.ts`); no feature code imports a vendor SDK or URL.
- Server-only code lives in `*.server.ts` / `*.functions.ts`; server-only
  modules are dynamically imported inside handlers so they cannot leak into a
  client bundle.

## Folder structure

```text
src/
  ai/                TensorFlow.js model definition, training worker, inference
  components/        Presentation components (states/ holds async-state primitives)
  config/            env.ts (client) and env.server.ts (server) configuration tiers
  context/           Auth, theme and sidebar providers
  hooks/             Reusable client hooks
  integrations/      Generated backend clients and auth middleware
  lib/
    data/            Repository tier (one file per aggregate)
    engines/         19 intelligence engines + registry + risk gate
    execution/       Pure fill/PnL simulation and its tests
    http/            Transport concerns (security headers)
    market/          Provider contract, instruments, provider adapters
    logger.ts        Structured JSON logging
  pages/             Screen-level composition
  routes/            File-based routing; api/public/* for external callers
supabase/migrations/ Versioned SQL (schema, RLS, grants, indexes)
docs/                Environment, deployment, API and database documentation
```

## Request flow for protected data

1. Client calls a `createServerFn`; `functionMiddleware` attaches the bearer token.
2. `requireSupabaseAuth` validates the token and injects a user-scoped client.
3. Rate limiting (`consumeRate`) is applied per user and action.
4. Zod validates input; the handler returns a plain DTO.
5. RLS scopes every row to `auth.uid()`; privileged writes use the service role
   only after a role check.

## Decision pipeline

Engines 1–14 → contradiction analysis → authoritative risk gate → engines 15–19
(master decision, explainability, trade review, learning, research). Every
engine returns the same `EngineResult` envelope with version, confidence,
evidence, warnings and latency, and `NO_TRADE` is a first-class outcome.
