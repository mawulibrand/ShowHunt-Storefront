# Development operations

Local PostgreSQL credentials in Compose and `.env.example` are development-only. Keep actual secrets in ignored environment files or the hosting platform's secret store. Do not expose local PostgreSQL beyond loopback.

Run migrations before API startup. Readiness returns 503 if PostgreSQL or the migration table is unavailable. Liveness only confirms the HTTP process responds. Schema changes must be new ordered migration files; never edit an applied migration.

Stop the stack with `docker compose -f infrastructure/compose.yaml down`. This retains database data. Volume deletion is destructive and is not part of ordinary setup.

Build the portable image from the repository root with `docker build -f infrastructure/Dockerfile -t showhunt:foundation .`. Its default command starts the API. Override with `node apps/api/dist/worker.js` for the worker, `pnpm --filter @showhunt/storefront start` for the storefront, and `pnpm --filter @showhunt/admin start` for admin. Inject environment variables at runtime. Run migrations as a release task with `node apps/api/scripts/migrate.mjs`.

Before staging: validate the container locally, configure managed PostgreSQL with TLS, environment variables, application domains, health checks and isolated staging provider credentials. Add a staging deployment pipeline. Production deployment must require manual approval of a traceable SHA.

Before launch: test backups/PITR and restore targets, provider reconciliation, access controls, alerts, real-device accessibility and load. This scaffold does not yet satisfy those release gates.
