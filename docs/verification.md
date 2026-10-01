# Foundation verification

## Passed locally

- Node.js 24.16.0 is available.
- pnpm 10.17.1 installation succeeded in `showhunt-storefront`; `pnpm-lock.yaml` is generated.
- TypeScript checks and production builds passed for storefront, admin and API.
- Five dependency-free tests pass: missing/invalid PostgreSQL configuration, invalid environment/port configuration, normal-text color contrast, production TLS/pool bounds and direct migration connection selection.
- API smoke test passed: liveness, request ID propagation, development OpenAPI and 503 readiness without PostgreSQL. Cold startup required increasing the harness wait from 10 to 60 seconds.
- `pnpm audit --prod --audit-level high` passed with no known vulnerabilities reported.
- Migration runner, smoke runner and environment module pass Node syntax checks.

## Pending

- Container build, successful hosted staging verification and manual browser/device review remain pending.

## Hosting-plan validation (2026-10-01)

- The project owner reported green GitHub CI for the previous pushed foundation changes. CI for this new local hosting change has not run on GitHub yet.
- All nine local Turborepo build/typecheck/test tasks pass after adding the pinned Vercel pool adapter. The generic API test task skips without API_TEST_URL, as documented below.
- Migrations ran twice successfully against the existing local PostgreSQL database.
- Separate API smoke testing with the Vercel adapter enabled locally passed: liveness, X-Request-ID, database readiness 200 and development OpenAPI. This is not a hosted Vercel test.
- Worker startup against the local migrated database and process heartbeat were observed. No jobs are implemented yet.
- Production dependency audit reports no known vulnerabilities.
- The original API .env remains ignored by Git. No provider credentials or paid resources were created.
- Vercel-native build/deployment, Neon TLS/connectivity, R2 bucket configuration, DigitalOcean worker container validation and hosted smoke tests remain pending. Local builds do not prove these provider-specific checks.

## Vercel startup investigation (2026-10-01)

- The project owner reported successful Neon migrations and green CI for the pushed hosting configuration.
- The first hosted API deployment returned INTERNAL_FUNCTION_INVOCATION_FAILED for /health/live. Its request details reported no outgoing requests and a response after about 60 seconds; hosted acceptance has not passed.
- A local reproduction of Vercel's public Node adapter captured Server.listen() without calling its callback. The original compiled API then timed out waiting for its module import to finish: top-level await app.listen() cannot complete while the adapter waits for that import before binding the captured server.
- Startup now awaits app.init() and starts app.listen() without awaiting its callback during module import. Listen errors set a nonzero exit code and emit a fixed diagnostic event.
- The new smoke-vercel.mjs script checks module import completion, HTTP liveness, request IDs, no-store, readiness 503 without a database, and production OpenAPI 404. It uses dummy credentials and is wired into CI after the build.
- The corrected API TypeScript build, Vercel-style startup regression and ordinary API smoke test all passed locally. A successful hosted redeployment is still required; the regression simulates the public adapter, not Vercel's private production runtime or build packaging.

## Reproduce completed checks

```sh
node --test packages/ui/test/contrast.test.mjs packages/validation/test/environment.test.mjs
node --check apps/api/scripts/migrate.mjs
node --check apps/api/scripts/smoke.mjs
```

After building the API, run `node apps/api/scripts/smoke-vercel.mjs` for the Vercel-style startup regression and `node apps/api/scripts/smoke.mjs` for ordinary server startup.

The API integration test intentionally skips when `API_TEST_URL` is absent; a skipped test is not counted as a passed runtime check.
