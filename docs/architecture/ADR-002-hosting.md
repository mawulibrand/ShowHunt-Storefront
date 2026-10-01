# ADR-002: Vercel, Neon, R2 and DigitalOcean worker

Status: accepted by the project owner on 2026-10-01; deployment pending.

This decision supersedes only the hosting target in SPEC-001. Keep the original spec as historical input. Feature scope, modular monolith, pnpm, Next.js, NestJS, PostgreSQL search/jobs, phone OTP, staff MFA, commerce invariants and release gates remain in force.

## Components

| Component | Deployment |
| --- | --- |
| Storefront | Vercel Next.js project rooted at apps/storefront |
| Admin | Vercel Next.js project rooted at apps/admin |
| API | Vercel NestJS project rooted at apps/api; native src/main.ts entry point |
| Database | Neon PostgreSQL 17, separate staging and production data/credentials |
| Public product/review images | Cloudflare R2, explicit public delivery configuration |
| Private evidence | Separate private R2 bucket; authorized, expiring signed URLs |
| Worker | DigitalOcean App Platform worker using infrastructure/worker.Dockerfile |

Proposed initial placement is Vercel fra1, Neon AWS eu-central-1 and DigitalOcean fra. This is a starting assumption to test from Ghana, not a measured latency claim. Adjust locations before provisioning if capacity, latency or cost warrants it.

## Runtime boundaries

The NestJS HTTP API uses Vercel Functions. Controllers and domain services do not depend on the Vercel SDK. A small platform adapter registers the PostgreSQL pool with Vercel so idle connections can close before function suspension. Local and container execution still use the same main.ts. Workers run only on DigitalOcean and never as detached work inside an HTTP invocation.

Use a Neon pooled connection for runtime SQL, with a bounded pool per process. Never rely on session-level state through the transaction pooler. Each business transaction must acquire one client and release it in finally. Use a DIRECT connection for migrations because the migration runner uses a session advisory lock. Production configuration requires sslmode=verify-full and never disables certificate verification.

The current worker is only a foundation process: it validates the initial migration at startup and emits process heartbeats without repeatedly querying PostgreSQL. Durable polling, leasing, retries, idempotency and outbox delivery remain future slice work. Once enabled, job polling and API traffic may prevent Neon scale-to-zero and increase compute use.

R2 adapters, upload validation and signed URLs will be implemented in their planned slices. No uploads are operational yet. Future large uploads should go directly to R2 using short-lived signed requests after server authorization, rather than passing file bodies through the API function.

## Release and isolation

Use staging projects and a staging database first. Do not give Vercel preview deployments production database or storage credentials. Staff/customer cookie scope, CSRF protection and cross-origin policy must be implemented and tested during identity slices; no broad wildcard credentialed CORS is introduced now.

Staging deployments should follow a successful CI run and tested migrations. Disable provider deployment-on-push initially so an unverified commit cannot deploy first. Before declaring M1 complete, wire CI success to coordinated staging deployment and verify the released SHA for all components. Production requires manual approval of a traceable release SHA. Run schema migrations once as a release task, never during Vercel builds or API cold starts.

Free allowances are not a guarantee of production suitability. Vercel commercial usage requires an eligible paid plan; Neon compute, storage and restore limits and R2 usage must be reviewed before deployment. Recovery targets from SPEC-001 remain unchanged; validate backups/restores and choose appropriate plans before launch.

## Portability

Keep standard SQL migrations, provider adapters, the existing portable Dockerfile and a worker-specific Dockerfile. A future move to DigitalOcean relocates apps, migrates PostgreSQL data, updates secrets/DNS and validates a planned cutover. R2 can remain unchanged. Vercel-native queues, authentication or commerce state are not introduced by this decision.

## References

- https://vercel.com/docs/frameworks/backend/nestjs
- https://vercel.com/kb/guide/connection-pooling-with-functions
- https://neon.com/docs/connect/connection-pooling
- https://docs.digitalocean.com/products/app-platform/reference/app-spec/
- https://developers.cloudflare.com/r2/
