# Foundation verification

## Passed locally

- Node.js 24.16.0 is available.
- pnpm 10.17.1 installation succeeded in `showhunt-storefront`; `pnpm-lock.yaml` is generated.
- TypeScript checks and production builds passed for storefront, admin and API.
- Three dependency-free tests pass: missing/invalid PostgreSQL configuration, invalid environment/port configuration, and normal-text color contrast.
- API smoke test passed: liveness, request ID propagation, development OpenAPI and 503 readiness without PostgreSQL. Cold startup required increasing the harness wait from 10 to 60 seconds.
- `pnpm audit --prod --audit-level high` passed with no known vulnerabilities reported.
- Migration runner, smoke runner and environment module pass Node syntax checks.

## Pending

- PostgreSQL migrations and positive readiness checks require PostgreSQL; neither Docker nor psql is installed locally.
- Container build, GitHub CI execution, staging deployment and manual browser/device review have not run.

## Reproduce completed checks

```sh
node --test packages/ui/test/contrast.test.mjs packages/validation/test/environment.test.mjs
node --check apps/api/scripts/migrate.mjs
node --check apps/api/scripts/smoke.mjs
```

The API integration test intentionally skips when `API_TEST_URL` is absent; a skipped test is not counted as a passed runtime check.
