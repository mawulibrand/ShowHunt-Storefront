# ShowHunt

Ghana-first, mobile-first commerce. This repository starts SPEC-001's foundation milestone with a branded pre-launch storefront, an inert staff shell, a NestJS API/worker and PostgreSQL migrations.

## Prerequisites

Node.js 24, pnpm 10.17.1 and Docker with Compose (or PostgreSQL 17). On Windows use `pnpm.cmd` where PowerShell blocks scripts. If pnpm is unavailable, `npx.cmd --yes pnpm@10.17.1 <command>` can run it without a global installation.

## Local setup

```sh
pnpm install
docker compose -f infrastructure/compose.yaml up -d
```

Copy `apps/api/.env.example` to `apps/api/.env`, then:

```sh
pnpm db:migrate
pnpm build
pnpm dev
```

The storefront runs at http://localhost:3000 and admin at http://localhost:3001. `pnpm dev` also watches API TypeScript; run the compiled API and worker in separate terminals:

```sh
pnpm --filter @showhunt/api start
pnpm --filter @showhunt/api start:worker
```

Restart API/worker after changes. API: http://localhost:4000/health/live. Database readiness: `/health/ready`. Development OpenAPI: `/api/v1/docs`.

## Checks

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm audit --prod --audit-level high
```

After building, run `node apps/api/scripts/smoke.mjs` to launch an isolated API and verify liveness, unavailable-database readiness, request IDs and OpenAPI. For tests against an existing service use `API_TEST_URL=http://localhost:4000`; set `EXPECT_DB_READY=true` for a running, migrated database. Without the URL, the integration test in `pnpm test` is explicitly skipped. CI provisions PostgreSQL, reapplies migrations to check idempotency, builds all apps and exercises API health/OpenAPI.

## Delivery status

I-02 is in progress. No customer authentication, real catalog, payment, inventory or staff controls exist yet. The public page accurately states that orders are unavailable. Staging is not provisioned. See [foundation decisions](docs/architecture/foundation.md) and [development runbook](docs/runbooks/development.md).

Dependencies are installed with pnpm 10.17.1 and `pnpm-lock.yaml` is included. Builds, TypeScript checks and the isolated API smoke test pass locally. Check [verification status](docs/verification.md) for remaining infrastructure checks.
