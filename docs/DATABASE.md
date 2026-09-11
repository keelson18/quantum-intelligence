# Database

Postgres, accessed exclusively through the repository tier
(`src/lib/data/*.repo.ts`) or server functions. Schema is versioned in
`supabase/migrations/` — never edited by hand in place.

## Conventions

- UUID primary keys (`gen_random_uuid()`).
- `user_id` foreign key for every user-owned table; `created_at`/`updated_at`
  timestamps with an `updated_at` trigger where rows mutate.
- Row Level Security enabled on every table, plus explicit `GRANT`s
  (`authenticated` for user tables, `service_role` for privileged paths,
  `anon` only for genuinely public data).
- Enumerated domains constrained with `CHECK` (e.g. execution event types,
  trade outcomes); time-dependent rules use triggers, not `CHECK`.
- Indexes on every access path used by the app: `(user_id, created_at DESC)`
  for feeds, `(user_id, action, created_at DESC)` for rate limiting,
  `(position_id)` for execution events.

## Table groups

| Group | Tables | Access rule |
| --- | --- | --- |
| Identity & roles | `profiles`, `user_roles` | Own row; roles are write-only via the server (`claimDefaultRole`) and read through `has_role` |
| Watchlists & alerts | `watchlists`, `alerts` | Owner-scoped |
| Paper trading | `paper_positions`, `paper_trades`, `execution_events` | Owner-scoped; fees, slippage and requested price persisted per fill |
| Journal & review | `journal_entries`, `trade_reviews` | Owner-scoped; one review per `(user_id, trade_id)` |
| Intelligence audit | `analysis_runs`, `engine_results`, `data_quality_events` | Owner-scoped; immutable audit trail |
| Models & backtests | `ai_models`, `ai_predictions`, `backtest_results`, `strategy_results` | Owner-scoped |
| Public data | `news_items`, `ml_predictions` | Public read (non user-identifying) |
| Infrastructure | `rate_limit_events` | Service role only |

## Integrity

- Foreign keys with `ON DELETE CASCADE` from owner rows so deleting a user
  leaves no orphans.
- Uniqueness where duplicates would be a bug (one review per trade, one role
  per `(user_id, role)`).
- Multi-row writes that must not partially apply run inside database functions
  so they are transactional.
- Reads are projected to needed columns and paginated with `range()`; no
  `select('*')` on unbounded feeds.
