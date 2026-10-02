import { readFile, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repository = 'mawulibrand/ShowHunt-Storefront';
const terminal = new Set(['ACTIVE', 'ERROR', 'CANCELED', 'SUPERSEDED']);
export class ReleaseError extends Error {}
function requireCondition(condition, message) {
  if (!condition) throw new ReleaseError(message);
}
function required(env, key, pattern) {
  const value = env[key];
  requireCondition(typeof value === 'string' && value.length > 0 && (!pattern || pattern.test(value)), `Missing or invalid ${key}`);
  return value;
}

export function configuration(env) {
  requireCondition(env.GITHUB_ACTIONS === 'true' && env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/main'
    && env.GITHUB_REPOSITORY === repository && env.STAGING_DEPLOY_ENABLED === 'true', 'Staging releases require an enabled main-branch push workflow');
  const sha = required(env, 'GITHUB_SHA', /^[a-f0-9]{40}$/);
  const databaseUrl = required(env, 'STAGING_DATABASE_DIRECT_URL');
  let database;
  try { database = new URL(databaseUrl); } catch { throw new ReleaseError('Invalid staging direct database URL'); }
  requireCondition(['postgres:', 'postgresql:'].includes(database.protocol) && database.hostname.endsWith('.neon.tech')
    && !database.hostname.includes('-pooler') && database.searchParams.get('sslmode') === 'verify-full'
    && Boolean(database.username && database.password && database.pathname.length > 1), 'Use a direct staging Neon URL with sslmode=verify-full');
  const projects = ['api', 'storefront', 'admin'].map(kind => ({
    kind,
    id: required(env, `STAGING_VERCEL_${kind.toUpperCase()}_PROJECT_ID`, /^prj_[A-Za-z0-9]+$/),
    name: `showhunt-staging-${kind}`,
    root: `apps/${kind}`,
    hostname: `showhunt-staging-${kind}.vercel.app`,
  }));
  requireCondition(new Set(projects.map(project => project.id)).size === 3, 'Use three distinct staging Vercel projects');
  return {
    sha, repository, branch: `staging-release/${sha}`, projects, databaseUrl,
    githubToken: required(env, 'GITHUB_TOKEN'),
    vercelToken: required(env, 'STAGING_VERCEL_TOKEN'),
    digitaloceanToken: required(env, 'STAGING_DIGITALOCEAN_TOKEN'),
    teamId: required(env, 'STAGING_VERCEL_TEAM_ID', /^team_[A-Za-z0-9]+$/),
    appId: required(env, 'STAGING_DIGITALOCEAN_APP_ID', /^[a-f0-9-]{36}$/),
    protectionBypass: env.STAGING_VERCEL_PROTECTION_BYPASS || '',
  };
}

export function providerClient(config, fetcher = fetch) {
  const origins = { github: 'https://api.github.com', vercel: 'https://api.vercel.com', digitalocean: 'https://api.digitalocean.com' };
  const tokens = { github: config.githubToken, vercel: config.vercelToken, digitalocean: config.digitaloceanToken };
  return async (provider, path, { method = 'GET', body, allow404 = false } = {}) => {
    const url = new URL(path, origins[provider]);
    requireCondition(url.origin === origins[provider], 'Provider request left its expected origin');
    if (provider === 'vercel') url.searchParams.set('teamId', config.teamId);
    const headers = { Authorization: `Bearer ${tokens[provider]}`, 'Content-Type': 'application/json' };
    if (provider === 'github') Object.assign(headers, { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });
    let response;
    try {
      response = await fetcher(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error', signal: AbortSignal.timeout(30000) });
    } catch { throw new ReleaseError(`${provider} ${method} request failed; inspect provider activity before retrying a release`); }
    if (allow404 && response.status === 404) return null;
    requireCondition(response.ok, `${provider} ${method} request failed (HTTP ${response.status})`);
    try { return await response.json(); } catch { throw new ReleaseError(`${provider} returned an invalid response`); }
  };
}

function validateApp(app, config) {
  requireCondition(app?.id === config.appId && app.spec?.name === 'showhunt-staging-worker'
    && app.spec?.workers?.length === 1, 'Expected the existing showhunt-staging-worker DigitalOcean app');
  requireCondition(['services', 'static_sites', 'jobs', 'functions', 'databases'].every(key => !app.spec[key]?.length), 'The staging worker app must contain no additional resources');
  const worker = app.spec.workers[0];
  requireCondition(worker.name === 'showhunt-worker' && worker.github?.repo === repository
    // The official SDK omits a false boolean; reject enabled or malformed values.
    && (worker.github.deploy_on_push === false || worker.github.deploy_on_push === undefined)
    && (worker.github.branch === 'main' || /^staging-release\/[a-f0-9]{40}$/.test(worker.github.branch)), 'Disable worker deployment on push and use the intended repository');
  requireCondition((worker.instance_count ?? 1) === 1 && !worker.autoscaling
    && ['apps-s-1vcpu-0.5gb', 'basic-xxs'].includes(worker.instance_size_slug), 'Expected one existing 512 MiB worker instance');
  requireCondition(worker.run_command?.trim() === 'node apps/api/dist/worker.js' && (!worker.source_dir || worker.source_dir === '/')
    && !worker.build_command?.trim(), 'Use the repository-root worker with a blank custom build command');
  requireCondition(!app.pinned_deployment?.id, 'Unpin the DigitalOcean rollback before a staging release');
  requireCondition([app.pending_deployment, app.in_progress_deployment].every(deployment => !deployment?.id || terminal.has(deployment.phase)), 'Another DigitalOcean deployment is still running');
  return worker;
}

async function verifyBranch(client, config, allowMissing = false) {
  const reference = await client('github', `/repos/${repository}/git/ref/heads/${config.branch}`, { allow404: allowMissing });
  requireCondition((allowMissing && reference === null) || reference?.object?.sha === config.sha, 'The staging release branch points to a different commit');
  return reference;
}

export async function preflight(config, { client, read = readFile, root = process.cwd() }) {
  for (const project of config.projects) {
    const local = JSON.parse(await read(resolve(root, project.root, 'vercel.json'), 'utf8'));
    requireCondition(local.git?.deploymentEnabled === false, `Disable automatic Git deployments in ${project.root}/vercel.json`);
    const current = await client('vercel', `/v9/projects/${project.id}`);
    requireCondition(current.id === project.id && current.name === project.name && current.rootDirectory === project.root
      && current.link?.type === 'github' && current.link.org === 'mawulibrand' && current.link.repo === 'ShowHunt-Storefront'
      && current.link.productionBranch === 'main', `Check the existing staging ${project.kind} project root and Git connection`);
    const alias = await client('vercel', `/v4/aliases/${project.hostname}?projectId=${project.id}`);
    requireCondition(alias.projectId === project.id && !alias.redirect && !alias.deletedAt, `Check the staging ${project.kind} domain ownership`);
  }
  const { app } = await client('digitalocean', `/v2/apps/${config.appId}`);
  validateApp(app, config);
  await verifyBranch(client, config, true);
  // Check main last, immediately before any migration or provider mutation.
  const main = await client('github', `/repos/${repository}/git/ref/heads/main`);
  return { app, stale: main?.object?.sha !== config.sha };
}

async function ensureBranch(client, config) {
  if (await verifyBranch(client, config, true)) return;
  await client('github', `/repos/${repository}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${config.branch}`, sha: config.sha } });
  await verifyBranch(client, config);
}

async function poll(check, message, { sleep, now }, timeout = 900000) {
  const deadline = now() + timeout;
  do {
    const result = await check();
    if (result) return result;
    await sleep(5000);
  } while (now() < deadline);
  throw new ReleaseError(message);
}

async function deployVercel(project, config, runtime) {
  const { client, log } = runtime;
  const created = await client('vercel', '/v13/deployments', { method: 'POST', body: {
    name: project.name, project: project.id, target: 'production',
    gitSource: { type: 'github', org: 'mawulibrand', repo: 'ShowHunt-Storefront', ref: 'main', sha: config.sha },
  } });
  requireCondition(typeof created.id === 'string' && /^dpl_[A-Za-z0-9]+$/.test(created.id), `Missing ${project.kind} deployment ID`);
  log(`${project.kind} deployment: ${created.id}`);
  await poll(async () => {
    const deployment = await client('vercel', `/v13/deployments/${created.id}?withGitRepoInfo=true`);
    requireCondition(deployment.id === created.id && deployment.projectId === project.id && deployment.target === 'production', `Unexpected ${project.kind} deployment identity`);
    requireCondition(!['ERROR', 'CANCELED'].includes(deployment.readyState), `${project.kind} deployment failed`);
    if (deployment.gitSource?.sha) requireCondition(deployment.gitSource.sha === config.sha, `${project.kind} deployed a different commit`);
    if (deployment.readyState !== 'READY') return false;
    requireCondition(deployment.gitSource?.sha === config.sha, `${project.kind} did not report the verified commit`);
    const alias = await client('vercel', `/v4/aliases/${project.hostname}?projectId=${project.id}`);
    requireCondition(alias.projectId === project.id && !alias.redirect && !alias.deletedAt, `Unexpected ${project.kind} domain ownership`);
    return alias.deploymentId === created.id;
  }, `${project.kind} deployment or domain assignment timed out`, runtime);
  return { component: project.kind, id: created.id, sha: config.sha, url: `https://${project.hostname}` };
}

function workerSource(deployment, config) {
  return deployment?.spec?.workers?.find(worker => worker.name === 'showhunt-worker')?.github?.branch === config.branch;
}
function workerSha(deployment) {
  return deployment?.workers?.find(worker => worker.name === 'showhunt-worker')?.source_commit_hash;
}

async function deployWorker(config, original, runtime) {
  const { client, log } = runtime;
  await verifyBranch(client, config);
  const { app: current } = await client('digitalocean', `/v2/apps/${config.appId}`);
  const worker = validateApp(current, config);
  requireCondition(JSON.stringify(current.spec) === JSON.stringify(original.spec), 'Worker settings changed during release; inspect and rerun');
  let deployment;
  if (worker.github.branch === config.branch && current.active_deployment?.phase === 'ACTIVE'
    && workerSource(current.active_deployment, config) && workerSha(current.active_deployment) === config.sha) {
    deployment = current.active_deployment;
  } else if (worker.github.branch === config.branch) {
    ({ deployment } = await client('digitalocean', `/v2/apps/${config.appId}/deployments`, { method: 'POST', body: { force_build: false } }));
  } else {
    const baseline = new Set([current.active_deployment?.id, current.pending_deployment?.id, current.in_progress_deployment?.id].filter(Boolean));
    const spec = structuredClone(current.spec);
    spec.workers[0].github.branch = config.branch;
    spec.workers[0].github.deploy_on_push = false;
    const updated = await client('digitalocean', `/v2/apps/${config.appId}`, { method: 'PUT', body: { spec, update_all_source_versions: true } });
    const candidate = app => [app?.pending_deployment, app?.in_progress_deployment, app?.active_deployment]
      .find(item => item?.id && !baseline.has(item.id) && workerSource(item, config));
    deployment = candidate(updated.app) || await poll(async () => {
      const { app } = await client('digitalocean', `/v2/apps/${config.appId}`);
      requireCondition(app.spec?.workers?.[0]?.github?.branch === config.branch, 'Worker source changed during release');
      return candidate(app);
    }, 'DigitalOcean did not report the updated deployment; inspect activity before retrying', runtime, 120000);
    // A spec update can deploy by itself. Never submit a second deployment here.
  }
  requireCondition(typeof deployment?.id === 'string' && /^[a-f0-9-]{36}$/.test(deployment.id), 'Missing worker deployment ID');
  log(`worker deployment: ${deployment.id}`);
  await poll(async () => {
    const { deployment: actual } = await client('digitalocean', `/v2/apps/${config.appId}/deployments/${deployment.id}`);
    requireCondition(actual.id === deployment.id && workerSource(actual, config), 'Unexpected worker deployment source');
    requireCondition(!['ERROR', 'CANCELED', 'SUPERSEDED'].includes(actual.phase), 'Worker deployment failed or was superseded');
    if (workerSha(actual)) requireCondition(workerSha(actual) === config.sha, 'Worker deployed a different commit');
    if (actual.phase !== 'ACTIVE') return false;
    const { app } = await client('digitalocean', `/v2/apps/${config.appId}`);
    validateApp(app, config);
    requireCondition(app.active_deployment?.id === actual.id && workerSha(app.active_deployment) === config.sha
      && app.spec?.workers?.[0]?.github?.branch === config.branch, 'The active worker does not match the verified release');
    return true;
  }, 'Worker deployment timed out', runtime);
  await verifyBranch(client, config);
  return { component: 'worker', id: deployment.id, sha: config.sha };
}

export async function smoke(config, { fetcher = fetch, read = readFile, root = process.cwd() }) {
  const requestId = `staging-${config.sha}`;
  const headers = { 'X-Request-ID': requestId };
  if (config.protectionBypass) headers['x-vercel-protection-bypass'] = config.protectionBypass;
  const get = async (project, path) => {
    try { return await fetcher(`https://${project.hostname}${path}`, { headers, redirect: 'error', signal: AbortSignal.timeout(60000) }); }
    catch { throw new ReleaseError(`${project.kind} HTTPS smoke request failed`); }
  };
  const api = config.projects.find(project => project.kind === 'api');
  for (const path of ['/health/live', '/health/ready']) {
    const response = await get(api, path);
    requireCondition(response.status === 200 && response.headers.get('x-request-id') === requestId
      && response.headers.get('cache-control')?.includes('no-store'), `API ${path} smoke check failed`);
    requireCondition((await response.json()).status === 'ok', `API ${path} returned unexpected health`);
  }
  for (const path of ['/api/v1/docs', '/api/v1/docs-json']) {
    requireCondition((await get(api, path)).status === 404, 'Production API documentation is exposed');
  }
  for (const project of config.projects.filter(project => project.kind !== 'api')) {
    const page = await get(project, '/');
    requireCondition(page.status === 200 && (await page.text()).includes('<title>ShowHunt'), `${project.kind} page smoke check failed`);
    for (const [path, local] of [['/brand/showhunt-logo-light.svg', 'public/brand/showhunt-logo-light.svg'], ['/icon.svg', 'app/icon.svg'], ['/favicon.ico', 'app/favicon.ico']]) {
      const response = await get(project, path);
      requireCondition(response.status === 200, `${project.kind} brand asset is unavailable`);
      const hash = value => createHash('sha256').update(value).digest('hex');
      requireCondition(hash(Buffer.from(await response.arrayBuffer())) === hash(await read(resolve(root, project.root, local))), `${project.kind} asset differs from the tested commit`);
    }
  }
}

export async function release(config, options = {}) {
  const runtime = { client: options.client || providerClient(config), log: options.log || console.log,
    sleep: options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms))), now: options.now || Date.now, ...options };
  const { app, stale } = await preflight(config, runtime);
  if (stale) {
    runtime.log(`Skipped superseded staging commit ${config.sha}`);
    return { skipped: true, sha: config.sha };
  }
  runtime.log(`Releasing verified staging commit ${config.sha}`);
  await ensureBranch(runtime.client, config);
  const main = await runtime.client('github', `/repos/${repository}/git/ref/heads/main`);
  if (main?.object?.sha !== config.sha) {
    runtime.log(`Skipped staging commit ${config.sha}: main advanced before migrations`);
    return { skipped: true, sha: config.sha };
  }
  await runtime.migrate();
  runtime.log('Staging migrations completed');
  const deployed = await Promise.allSettled(config.projects.map(project => deployVercel(project, config, runtime)));
  for (const result of deployed) if (result.status === 'rejected') throw result.reason;
  const components = deployed.map(result => result.value);
  components.push(await deployWorker(config, app, runtime));
  // Recheck aliases after all builds, before testing stable URLs.
  for (const component of components.filter(item => item.component !== 'worker')) {
    const project = config.projects.find(item => item.kind === component.component);
    const alias = await runtime.client('vercel', `/v4/aliases/${project.hostname}?projectId=${project.id}`);
    requireCondition(alias.projectId === project.id && alias.deploymentId === component.id && !alias.redirect && !alias.deletedAt, 'A staging domain changed during release');
  }
  await (runtime.smoke || (() => smoke(config, runtime)))();
  runtime.log(`Staging smoke checks passed for ${config.sha}`);
  return { sha: config.sha, components };
}

function migrate(config, root) {
  return new Promise((resolvePromise, reject) => {
    // Only the migration subprocess receives the database secret; raw output is suppressed.
    const child = spawn(process.execPath, ['apps/api/scripts/migrate.mjs'], {
      cwd: root, stdio: 'ignore', env: {
        PATH: process.env.PATH, NODE_ENV: 'production', DATABASE_DIRECT_URL: config.databaseUrl,
      }, timeout: 180000,
    });
    child.once('error', () => reject(new ReleaseError('Staging migration could not start')));
    child.once('exit', code => code === 0 ? resolvePromise() : reject(new ReleaseError('Staging migration failed; inspect the staging database before retrying')));
  });
}

async function main() {
  try {
    const config = configuration(process.env);
    const root = process.cwd();
    const result = await release(config, { root, migrate: () => migrate(config, root) });
    if (process.env.GITHUB_STEP_SUMMARY) {
      const text = result.skipped ? `Staging release skipped: main advanced past \`${result.sha}\`.\n`
        : `Staging release \`${result.sha}\` passed migrations and HTTPS smoke checks.\n\n| Component | Deployment | Commit |\n| --- | --- | --- |\n`
          + result.components.map(component => `| ${component.component} | ${component.id} | ${component.sha} |`).join('\n') + '\n';
      await appendFile(process.env.GITHUB_STEP_SUMMARY, text);
    }
  } catch (error) {
    console.error(error instanceof ReleaseError ? error.message : 'Staging release failed; inspect provider activity before retrying');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
