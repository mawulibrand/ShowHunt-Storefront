# Foundation decisions

SPEC-001 is the V1 scope authority. ShowHunt is a single retailer. Marketplace, Redis, microservices and AI features are excluded.

The hosting target is superseded by [ADR-002](ADR-002-hosting.md): Vercel storefront/admin/API, Neon PostgreSQL, Cloudflare R2 and a DigitalOcean worker. Feature scope and release gates remain unchanged.

- Node 24; TypeScript; pnpm workspaces and Turborepo.
- Separate Next.js storefront (3000) and staff shell (3001).
- NestJS API (4000) and separate worker entry point. Domain modules follow the spec's delivery slices.
- PostgreSQL with ordered SQL migrations, session advisory locking, checksums and per-migration transactions. Applied files cannot be silently edited.
- API routes use `/api/v1`; health routes remain `/health/live` and `/health/ready`. Readiness requires a migrated database. OpenAPI is disabled in production for this initial scaffold.
- HTTP logs omit bodies, query strings, cookies and authorization. Bounded request IDs are returned to callers. Propagating actor/request context to jobs and audits is part of their implementation slices.
- Worker checks the database/schema once at startup and then emits process heartbeats without database queries. It does not process jobs yet; durable jobs and outbox delivery belong to subsequent slices.
- Money uses integer minor units; timestamps use UTC/TIMESTAMPTZ.

## Brand

Shared CSS defines navy `#14213D`, teal `#008787`, orange `#FCA311` and white. Orange actions use navy text. The original teal remains a brand token; a darker `#007F7F` variant is used behind normal white text and for small teal labels to meet 4.5:1 contrast. Automated contrast tests protect these text pairs. Keyboard focus, skip links, responsive layouts and minimum button sizes are included. Full WCAG 2.2 AA verification remains a release gate.

## Current limits

This is a foundation scaffold, not a transactional store. Identity, catalog, stock, checkout, providers, staff authorization and operational features have not been implemented. The portable container definition requires Docker validation. Staging deployment, monitoring integration and recovery validation remain open foundation/operations work. No production readiness claim is made.

Versions were checked against the npm registry. Framework references: https://nextjs.org/docs/app/getting-started/installation and https://github.com/nestjs/nest/blob/master/packages/core/package.json .
