# Foundation verification

## Current staging evidence (2026-10-02)

- Before this automation change, the local repository and origin/main matched `d96f9d78dc8006e631bd10e660b86c750222fa0b` (Record staging verification and optimize worker build). The owner previously reported green Foundation checks for branding commit `b13a48d467a54eee859bc3ff70710d4285b9c3ab`; GitHub's run was not independently inspected.
- Both Vercel frontend URLs returned HTTP 200 and referenced the new logo. Their logo SVG, favicon.ico and icon.svg matched the corresponding local file hashes. This confirms asset delivery, not the deployed SHA of every service.
- Branding builds passed for storefront/admin. Browser checks of both local production builds at 1440, 375 and 320 pixels found no horizontal overflow, failed assets or runtime errors; logo keyboard focus was visible. These checks do not substitute for a Ghana mobile-network performance benchmark.
- Hosted API checked again on October 2: /health/live and /health/ready returned 200 with status ok, X-Request-ID and Cache-Control: no-store. Production /api/v1/docs returned 404. The startup deadlock described in the earlier investigation is resolved on the deployed service.
- Owner-supplied DigitalOcean runtime logs show worker_started at 2026-10-01 16:02:54 and worker_process_heartbeat every minute from 16:03:54 through 16:18:54. In the current worker, startup is logged only after PostgreSQL answers and the foundation migration is found. Heartbeats confirm process activity for that recorded window, not continuous database connectivity or job processing. No job handlers exist yet.
- On October 2, the owner reported successful worker redeployment after the root `heroku-postbuild` change and blank custom build command. The provider commit and fresh runtime logs were not independently inspected.
- The owner reported creation of showhunt-staging-media and showhunt-staging-evidence. A media-bucket screenshot showed Standard storage before public access was enabled. The media development base URL is https://pub-c9feaa9b1f8e4fa6be41c16972d91771.r2.dev.
- Manual R2 upload/public-read check passed: the owner supplied the actual object URL, https://pub-c9feaa9b1f8e4fa6be41c16972d91771.r2.dev/showhunt-logo-light.svg. An independent GET at 13:39 UTC returned HTTP 200, Content-Type image/svg+xml and 6,193 bytes; the SHA-256 matched the local SVG. The earlier 404 came from checking an unuploaded PNG filename. No application upload or authenticated storage operation has been tested.
- The owner confirmed that `showhunt-staging-evidence` has Public Development URL disabled and no connected Custom Domains. This records the dashboard configuration; private authorized reads will be tested when the files adapter is implemented.
- pnpm 10.17.1 is installed in the Windows user account; pnpm.cmd works and the owner confirmed local development starts.

## Remaining foundation acceptance

Local staging release preparation passed 29 simulated provider/failure-path tests and Node syntax checking. All three Vercel configurations parsed successfully. The tests cover migration gating, stale/ref/commit mismatches, domain ownership, preserved encrypted worker settings, reruns, timeouts and production HTTPS smoke behavior. They do not establish hosted provider integration; the workflow remains disabled until configured and exercised.

- Configure and exercise the opt-in CI-gated staging release job, proving the intended SHA for API, worker and both frontends. No provider release has been triggered by the assistant. See [activation runbook](runbooks/staging-release.md).
- Verify hosted worker shutdown/restart and unavailable-database behavior, and validate the portable Docker images separately.
- Exercise a fresh-clone setup, hosted failure checks and Ghana mobile-network timings; validate restore capability before launch. The backend p95 latency target has not been measured.
- R2 adapter, signed uploads, media validation and private evidence authorization remain future catalog/files work. Provider resource creation and manual public reads do not establish those application capabilities.

The sections below record earlier checks and their limitations at the time they were performed.

## Passed locally

- Node.js 24.16.0 is available.
- pnpm 10.17.1 installation succeeded in `showhunt-storefront`; `pnpm-lock.yaml` is generated.
- TypeScript checks and production builds passed for storefront, admin and API.
- Five dependency-free tests pass: missing/invalid PostgreSQL configuration, invalid environment/port configuration, normal-text color contrast, production TLS/pool bounds and direct migration connection selection.
- API smoke test passed: liveness, request ID propagation, development OpenAPI and 503 readiness without PostgreSQL. Cold startup required increasing the harness wait from 10 to 60 seconds.
- `pnpm audit --prod --audit-level high` passed with no known vulnerabilities reported.
- Migration runner, smoke runner and environment module pass Node syntax checks.

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
