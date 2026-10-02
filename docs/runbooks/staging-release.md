# CI-gated staging releases

`deploy_staging` runs only after `verify` passes for a push to `main` and repository variable `STAGING_DEPLOY_ENABLED` is exactly `true`. Pull requests and other branches cannot deploy. Activation and the first hosted release remain pending until the configuration below is complete.

The three existing Vercel staging projects use their Production environment settings with staging credentials. Production ShowHunt projects are separate and are not targeted here.

## 1. Provider settings

Each app's `vercel.json` now sets `git.deploymentEnabled: false`, stopping automatic Git deployments for every branch. Existing running deployments remain available; manual deployment is available during setup. Keep the GitHub repository connected. Explicit REST deployment with this flag is inferred from its documented automatic-deployment scope and must be confirmed by the first hosted release. [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration)

In DigitalOcean, set the existing app's name to **showhunt-staging-worker** in app Settings. Keep its component named **showhunt-worker**. Select that component, edit its source configuration and disable **Autodeploy**. Keep source directory `/`, a blank custom build command, run command `node apps/api/dist/worker.js`, and one 512 MiB instance. Wait for any deployment to finish before activation. The workflow updates this existing resource and preserves its configuration; it does not create an app or resize it. [DigitalOcean source settings](https://docs.digitalocean.com/products/app-platform/how-to/manage-source-repo/)

## 2. Repository variables

Open **GitHub → mawulibrand/ShowHunt-Storefront → Settings → Secrets and variables → Actions → Variables → New repository variable**.

| Name | Value/source |
| --- | --- |
| `STAGING_VERCEL_TEAM_ID` | Intended Vercel team's ID, beginning `team_`; team Settings → General |
| `STAGING_VERCEL_API_PROJECT_ID` | `showhunt-staging-api` Settings → General → Project ID, beginning `prj_` |
| `STAGING_VERCEL_STOREFRONT_PROJECT_ID` | `showhunt-staging-storefront` Project ID |
| `STAGING_VERCEL_ADMIN_PROJECT_ID` | `showhunt-staging-admin` Project ID |
| `STAGING_DIGITALOCEAN_APP_ID` | Existing worker app UUID in its dashboard URL, not a deployment ID |
| `STAGING_DEPLOY_ENABLED` | Leave absent or `false` until provider settings and secrets are ready |

Before mutation, the script verifies staging project names, repository, `main` production branch, roots and default `showhunt-staging-*.vercel.app` domains. It also checks the worker app's ID/name. Wrong targets stop the release. IDs are configuration, not access tokens.

## 3. Repository secrets

On the same GitHub page, select **Secrets → New repository secret**. Enter values directly in GitHub, never in chat or tracked files.

| Name | Value/source |
| --- | --- |
| `STAGING_DATABASE_DIRECT_URL` | Staging Neon direct connection, including `sslmode=verify-full`; no `-pooler` hostname |
| `STAGING_VERCEL_TOKEN` | Vercel access token scoped to the intended team, with an expiry |
| `STAGING_DIGITALOCEAN_TOKEN` | DigitalOcean custom-scope token with `app:read` and `app:update` |
| `STAGING_VERCEL_PROTECTION_BYPASS` | Optional automation bypass secret if staging protection blocks HTTPS smoke checks |

Use the staging migration role with required DDL privileges. Runtime credentials remain in their providers; R2 keys are not needed here. `GITHUB_TOKEN` is supplied automatically, so no GitHub personal access token is required.

Repository secrets/variables avoid paid environment-secret requirements for private repositories on GitHub Free. Verification has contents read permission; only release requests contents write for a commit-specific branch. Checkout does not persist credentials. Provider/database secrets are passed only to the release command after dependency installation. [GitHub secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets), [Vercel authentication](https://vercel.com/docs/rest-api/reference/authentication), [DigitalOcean tokens](https://docs.digitalocean.com/reference/api/create-personal-access-token/)

## 4. Activate and verify

Push this workflow change first. **Foundation checks → verify** must pass; **Deploy verified commit to staging** is skipped while activation is disabled.

After configuration, set `STAGING_DEPLOY_ENABLED=true` and trigger a new main push from the repository root:

```sh
git commit --allow-empty -m "Run first CI-gated staging release"
git push origin main
```

Open GitHub **Actions → Foundation checks**. The release must start after verification, pass migrations, deploy all services and pass HTTPS checks. Its summary lists the full commit SHA and four provider deployment IDs. Check worker Runtime Logs for `worker_started` and a subsequent heartbeat; ACTIVE alone does not prove startup database readiness or job processing.

Record the run URL, SHA, deployment IDs and manual smoke results in `docs/verification.md`. Coordinated staging deployment is verified only after that run succeeds. Remaining foundation fresh-clone/failure-path checks and later launch recovery/performance gates still apply.

## Release behavior

The script performs read-only configuration checks and skips superseded queued commits before mutation. It creates `staging-release/<40-character-sha>` once, verifies that existing refs have not moved, and checks `main` again immediately before migration. If main advances there, only a harmless release branch may have been created. After migration starts, it finishes the same tested SHA even if main advances. Releases are serialized with `cancel-in-progress: false`; GitHub may replace an older pending job, so not every intermediate commit must deploy.

DigitalOcean fetches branches rather than accepting a commit override. The release branches remain stable by workflow convention, not inherent protection against manual force pushes. Do not edit/delete the worker's current release branch; its SHA is verified before/after worker deployment. Release-branch pushes do not recursively trigger Foundation checks.

Migrations run once with the existing direct-connection runner's advisory lock, checksum validation and per-file transactions. Raw migration output is suppressed. Future changes must remain compatible with services still running during rollout.

Vercel receives explicit `gitSource.sha` and must report READY, the expected project/commit and stable domains assigned to its new deployment IDs. DigitalOcean receives the existing full app spec, preserving encrypted secrets/settings, with only the worker branch changed. Source versions are refreshed; the deployment triggered by that update is followed without submitting a duplicate. The actual active worker must report the tested SHA. An already active worker at the same source/commit is reused on rerun.

HTTPS checks cover API liveness/readiness, request ID/no-store headers, production OpenAPI unavailability, frontend HTML and committed logo/icon/favicon hashes. The optional bypass secret is used only for these checks and does not disable deployment protection.

API references: [Vercel deployments](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment), [deployment details](https://vercel.com/docs/rest-api/deployments/get-a-deployment-by-id-or-url), [aliases](https://vercel.com/docs/rest-api/aliases/get-an-alias), [DigitalOcean apps](https://docs.digitalocean.com/reference/api/reference/apps/), [GitHub refs](https://docs.github.com/en/rest/git/refs).

## Failure and retry

Failed migrations stop provider deployment. Later failures may leave services at different versions; releases across providers are not atomic. Provider mutations are not automatically retried after uncertain network failures, and already applied migrations are not rolled back.

Inspect the logged component deployment IDs and provider activity before retrying. Wait for worker activity to finish and avoid dashboard edits during releases. Rerun all jobs for the latest failed main run or push a corrected commit. Older runs skip if main has advanced. Wrong commits, changed worker settings, reassigned domains, altered refs, timeout and superseded deployment fail the release.

Set `STAGING_DEPLOY_ENABLED=false` to stop future releases. This neither cancels an active release nor rolls back code/schema. Production approval and deployment are outside this staging workflow.

## Local verification

```sh
node --test scripts/test/deploy-staging.test.mjs
node --check scripts/deploy-staging.mjs
```

Simulated provider tests exercise orchestration boundaries without credentials or cloud mutations. The first actual release must establish hosted integration evidence.
