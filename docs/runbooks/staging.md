# Staging deployment: revised hosting plan

This is a prepared runbook, not evidence of deployment. Account access, secrets, spending approval, provider builds and live smoke tests are still required. See ADR-002 for the approved architecture.

## 1. Accounts and region

Prepare Vercel with a plan eligible for commercial use, Neon, Cloudflare R2 and DigitalOcean with billing enabled. Connect the intended GitHub account and repository mawulibrand/ShowHunt-Storefront. Start with Frankfurt: Vercel fra1, Neon AWS eu-central-1, DigitalOcean fra, subject to availability and Ghana latency testing. Review the provider checkout totals before creating paid resources.

## 2. Neon database

Create an isolated staging project with PostgreSQL 17. Obtain both pooled and direct connection strings. Store secrets only in provider secret settings or ignored local env files. In both strings use sslmode=verify-full, preserving other required provider parameters. The pooled hostname typically includes -pooler; the direct hostname must not.

| Variable | Use |
| --- | --- |
| DATABASE_URL | Pooled connection: API and worker runtime |
| DATABASE_DIRECT_URL | Direct connection: migration/release task only |
| DB_POOL_MAX | Start with 3 for API, 2 for worker; adjust with connection measurements |
| NODE_ENV | production on both hosted API and worker, including staging |

Use a migration role with DDL privileges. Restrict runtime roles to the required tables as the data model develops. Never put database secrets into NEXT_PUBLIC variables. Test pg_trgm availability when the search slice is implemented.

Run migrations from the repository root in a shell with the staging DIRECT URL and NODE_ENV=production loaded securely:

```sh
node apps/api/scripts/migrate.mjs
```

The runner accepts DATABASE_DIRECT_URL without a runtime DATABASE_URL. Re-run it to verify replay. Do not use the local setup script against cloud databases; it creates a local development role/database. Never run migrations as an HTTP endpoint.

## 3. Vercel projects

Import the same repository as three separate staging projects:

| Project | Root directory | Framework |
| --- | --- | --- |
| showhunt-staging-api | apps/api | NestJS |
| showhunt-staging-storefront | apps/storefront | Next.js |
| showhunt-staging-admin | apps/admin | Next.js |

Use Node 24 and the repository's pnpm 10.17.1 pin. Include files outside each root directory so shared workspace packages are accessible. Retain the checked-in vercel.json build commands. Vercel natively detects src/main.ts; do not add legacy catch-all serverless handlers. Check that decorators, workspace imports and native dependencies compile in the provider build.

Set the API runtime environment variables listed above, excluding DATABASE_DIRECT_URL. The frontends do not need database credentials. HUNT_SALES_END_AT is an optional storefront build variable containing an absolute timestamp with a timezone. Changing it requires a rebuild. API endpoint wiring and cookie/CSRF controls are part of the identity and commerce slices; the present shells do not call commerce endpoints.

Keep production credentials out of previews. Disable automatic production-branch deployments during initial setup; deploy the CI-approved SHA manually for the first validation. A staging Vercel project uses its Production environment settings but only staging resources. Provider access protection may require authentication or a bypass secret for smoke tests; keep any bypass secret private and do not disable protection on the future staff application for convenience.

## 4. Worker

Use infrastructure/digitalocean/worker-staging.example.yaml as a template. Replace the database placeholder in a private copy or in DigitalOcean's secret editor. Keep the template itself secret-free. Deploy with repository-root build context and infrastructure/worker.Dockerfile; no HTTP port is required. The template is one 512 MiB worker and creates paid resources when submitted.

It must start only after migrations are applied. Look for worker_started and subsequent worker_process_heartbeat logs. A startup database failure exits nonzero. This process has no job handlers yet, so these logs do not prove notification or payment processing.

## 5. R2

Create separate staging public-media and private-evidence buckets, and later separate production buckets. Limit credentials to the intended buckets. Leave private-evidence public access disabled. Do not add provider keys to frontend projects. Upload capability and the exact validated environment-variable contract will be delivered with the catalog/files slices; no placeholder upload service is deployed now.

## 6. Acceptance and automation

Verify on the deployed SHA:

- API /health/live returns 200 and X-Request-ID.
- API /health/ready returns 200 against the staging schema; simulated DB failure returns 503.
- /api/v1/docs is unavailable with NODE_ENV=production.
- Storefront and admin shells load over HTTPS on a Ghana mobile connection.
- Worker startup and shutdown work and logs contain no connection strings.
- Frontend, API and worker deployments identify the same intended release SHA.

Record cold and warm timings, including API-to-database latency. Do not claim the 500 ms backend p95 target has passed without a representative benchmark. Verify database restore capability and its plan limits before launch.

Next, configure the staging deployment workflow to run only after Foundation checks succeeds on main, apply backward-compatible migrations once, deploy components and execute smoke tests. Provider project IDs and scoped secrets are required to complete that wiring. Staging automation is pending until configured and exercised; a manual first deployment alone does not finish the gate.
