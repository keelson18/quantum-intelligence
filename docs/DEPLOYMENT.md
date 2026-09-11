# Deployment

## Targets

- **Managed (default):** publish from the Lovable editor. Frontend changes go
  live on publish; server functions and migrations deploy immediately.
- **Container:** build the included `Dockerfile` and run it anywhere
  (Cloud Run, ECS, Fly, Kubernetes). Public `VITE_*` config must be passed as
  build args because it is inlined at build time; secrets are passed at runtime.

```sh
docker build \
  --build-arg VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY="$VITE_SUPABASE_PUBLISHABLE_KEY" \
  --build-arg VITE_MARKET_REST_URL="$VITE_MARKET_REST_URL" \
  --build-arg VITE_MARKET_WS_URL="$VITE_MARKET_WS_URL" \
  --build-arg BUILD_REVISION="$(git rev-parse --short HEAD)" \
  -t greenhill:"$(git rev-parse --short HEAD)" .

docker run -p 8080:8080 --env-file .env greenhill:latest
```

## CI pipeline (recommended order)

1. `bun install --frozen-lockfile`
2. `bun run lint`
3. `bun run typecheck`
4. `bun run test`
5. `bun run build`
6. Deploy, then poll `GET /api/public/health` until it returns 200.

## Health and monitoring

- `GET /api/public/health` → `{ status, checks: { runtime, database }, revision }`.
  200 when serving, 503 when the database is unreachable. No user data.
- Logs are single-line JSON (`level`, `message`, `timestamp`, plus fields), so
  any aggregator can index them. Credential-looking fields are redacted.
- Set `LOG_LEVEL=warn` in production if volume matters; `debug` for triage.

## Rollback

Redeploy the previous image tag or previous published version. Database
migrations are additive by convention; a rollback that requires dropping
columns must ship as a new, explicitly reviewed migration.
