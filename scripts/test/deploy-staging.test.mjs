import test from 'node:test';
import assert from 'node:assert/strict';
import { configuration, preflight, providerClient, release, smoke, ReleaseError } from '../deploy-staging.mjs';

const SHA = 'a'.repeat(40);
const OLD_SHA = 'b'.repeat(40);
const APP_ID = '11111111-1111-1111-1111-111111111111';
const OLD_DEPLOYMENT = '22222222-2222-2222-2222-222222222222';
const NEW_DEPLOYMENT = '33333333-3333-3333-3333-333333333333';
const env = () => ({
  GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main',
  GITHUB_REPOSITORY: 'mawulibrand/ShowHunt-Storefront', GITHUB_SHA: SHA,
  STAGING_DEPLOY_ENABLED: 'true', GITHUB_TOKEN: 'github-fixture-secret',
  STAGING_VERCEL_TOKEN: 'vercel-fixture-secret', STAGING_DIGITALOCEAN_TOKEN: 'do-fixture-secret',
  STAGING_VERCEL_TEAM_ID: 'team_Staging', STAGING_DIGITALOCEAN_APP_ID: APP_ID,
  STAGING_VERCEL_API_PROJECT_ID: 'prj_Api', STAGING_VERCEL_STOREFRONT_PROJECT_ID: 'prj_Storefront',
  STAGING_VERCEL_ADMIN_PROJECT_ID: 'prj_Admin',
  STAGING_DATABASE_DIRECT_URL: 'postgresql://staging:database-fixture-secret@ep-staging.eu-central-1.aws.neon.tech/showhunt?sslmode=verify-full',
});
const copy = value => structuredClone(value);
const asset = path => Buffer.from(`tested-asset:${path.split(/[\\/]/).at(-1)}`);

test('disabled worker autodeploy tolerates the official SDK omitting its false boolean', async () => {
  const { config, state, runtime } = fixture();
  delete state.app.spec.workers[0].github.deploy_on_push;
  const result = await release(config, runtime);
  assert.equal(result.sha, SHA);
  const update = state.calls.find(call => call.provider === 'digitalocean' && call.method === 'PUT');
  assert.equal(update.body.spec.workers[0].github.deploy_on_push, false);
});

function fixture(options = {}) {
  const config = configuration(env());
  const spec = {
    name: 'showhunt-staging-worker', region: 'fra', features: ['buildpack-stack=ubuntu-22'],
    alerts: [{ rule: 'DEPLOYMENT_FAILED' }],
    envs: [{ key: 'APP_PRIVATE_KEY', type: 'SECRET', scope: 'RUN_TIME', value: 'EV[1:app-encrypted:keep-verbatim]' }],
    workers: [{
      name: 'showhunt-worker', github: { repo: config.repository, branch: options.existingBranch || 'main', deploy_on_push: false },
      run_command: 'node apps/api/dist/worker.js', build_command: '', source_dir: '/', environment_slug: 'node-js',
      instance_count: 1, instance_size_slug: 'basic-xxs', termination: { grace_period_seconds: 120 },
      envs: [{ key: 'DATABASE_URL', type: 'SECRET', scope: 'RUN_TIME', value: 'EV[1:database-encrypted:keep-verbatim]' },
        { key: 'PNPM_SKIP_PRUNING', type: 'GENERAL', scope: 'BUILD_TIME', value: 'true' }],
    }],
  };
  const deployment = (id, branch, sha, phase = 'ACTIVE') => {
    const deployedSpec = copy(spec);
    deployedSpec.workers[0].github.branch = branch;
    return { id, phase, spec: deployedSpec, workers: [{ name: 'showhunt-worker', source_commit_hash: sha }] };
  };
  const state = {
    app: { id: APP_ID, spec, active_deployment: deployment(OLD_DEPLOYMENT, spec.workers[0].github.branch,
      options.existingSha || OLD_SHA) },
    mainSha: options.mainSha || SHA, branchSha: options.branchSha || (options.existingBranch ? SHA : undefined),
    calls: [], logs: [], migrated: 0, smoked: 0, elapsed: 0, appReads: 0,
    vercel: new Map(), aliases: new Map(), workerDeployments: new Map(),
  };
  const mutate = () => { if (options.advanceMainOnMutation) state.mainSha = OLD_SHA; };
  const client = async (provider, path, request = {}) => {
    const method = request.method || 'GET';
    state.calls.push({ provider, path, method, body: copy(request.body) });
    if (method !== 'GET') mutate();
    if (provider === 'github') {
      if (path.endsWith('/git/ref/heads/main')) return { object: { sha: state.mainSha } };
      if (path.includes('/git/ref/heads/staging-release/')) return state.branchSha ? { object: { sha: state.branchSha } } : null;
      if (path.endsWith('/git/refs') && method === 'POST') {
        assert.equal(request.body.ref, `refs/heads/${config.branch}`);
        assert.equal(request.body.sha, SHA);
        state.branchSha = request.body.sha;
        return { object: { sha: state.branchSha } };
      }
    }
    if (provider === 'vercel') {
      if (path.startsWith('/v9/projects/')) {
        const project = config.projects.find(item => path.endsWith(item.id));
        return { id: project.id, name: project.name, rootDirectory: options.wrongProjectRoot && project.kind === 'api' ? '/' : project.root,
          link: { type: 'github', org: 'mawulibrand', repo: 'ShowHunt-Storefront', productionBranch: 'main' } };
      }
      if (path.startsWith('/v4/aliases/')) {
        const project = config.projects.find(item => path.includes(item.hostname));
        return { projectId: options.wrongAliasOwner && state.vercel.size ? 'prj_Other' : project.id,
          deploymentId: state.aliases.get(project.id) || 'dpl_Previous' };
      }
      if (path === '/v13/deployments' && method === 'POST') {
        const project = config.projects.find(item => item.id === request.body.project);
        const id = `dpl_${project.kind}`;
        state.vercel.set(id, { id, projectId: project.id, target: 'production',
          readyState: options.vercelNeverReady ? 'BUILDING' : 'READY',
          gitSource: { sha: options.wrongVercelSha && project.kind === 'api' ? OLD_SHA : request.body.gitSource.sha } });
        state.aliases.set(project.id, id);
        return { id };
      }
      if (path.startsWith('/v13/deployments/')) return copy(state.vercel.get(path.split('/').at(-1).split('?')[0]));
    }
    if (provider === 'digitalocean') {
      if (path === `/v2/apps/${APP_ID}` && method === 'GET') {
        state.appReads += 1;
        if (options.settingsRace && state.appReads === 2) state.app.spec.workers[0].termination.grace_period_seconds = 90;
        return { app: copy(state.app) };
      }
      if (path === `/v2/apps/${APP_ID}` && method === 'PUT') {
        state.app.spec = copy(request.body.spec);
        const pending = deployment(NEW_DEPLOYMENT, config.branch, options.wrongWorkerSha ? OLD_SHA : SHA, 'PENDING_BUILD');
        state.app.pending_deployment = pending;
        state.workerDeployments.set(NEW_DEPLOYMENT, deployment(NEW_DEPLOYMENT, config.branch,
          options.wrongWorkerSha ? OLD_SHA : SHA, 'ACTIVE'));
        return { app: copy(state.app) };
      }
      if (path === `/v2/apps/${APP_ID}/deployments` && method === 'POST') {
        const created = deployment(NEW_DEPLOYMENT, config.branch, SHA, 'ACTIVE');
        state.workerDeployments.set(NEW_DEPLOYMENT, created);
        return { deployment: copy(created) };
      }
      if (path.startsWith(`/v2/apps/${APP_ID}/deployments/`)) {
        const id = path.split('/').at(-1);
        const actual = state.workerDeployments.get(id) || state.app.active_deployment;
        if (!options.wrongActiveWorker) state.app.active_deployment = copy(actual);
        state.app.pending_deployment = undefined;
        return { deployment: copy(actual) };
      }
    }
    throw new Error(`Unhandled fixture request: ${provider} ${method} ${path}`);
  };
  const runtime = {
    client, root: '/fixture', read: async path => path.endsWith('vercel.json')
      ? JSON.stringify({ git: { deploymentEnabled: false } }) : asset(path),
    log: value => state.logs.push(value), now: () => state.elapsed,
    sleep: async ms => { state.elapsed += ms; },
    migrate: async () => {
      state.migrated += 1;
      if (options.advanceMainDuringMigration) state.mainSha = OLD_SHA;
      if (options.migrationFails) throw new ReleaseError('Fixture migration failed');
    },
    smoke: async () => { state.smoked += 1; },
  };
  return { config, state, runtime, client };
}

const mutations = state => state.calls.filter(call => call.method !== 'GET');

test('superseded CI commit performs reads only and does not migrate', async () => {
  const { config, state, runtime } = fixture({ mainSha: OLD_SHA });
  assert.deepEqual(await release(config, runtime), { skipped: true, sha: SHA });
  assert.equal(state.migrated, 0);
  assert.equal(state.smoked, 0);
  assert.deepEqual(mutations(state), []);
});

test('an existing release ref pointing to another SHA aborts before mutation', async () => {
  const { config, state, runtime } = fixture({ branchSha: OLD_SHA });
  await assert.rejects(release(config, runtime), /release branch points to a different commit/);
  assert.equal(state.migrated, 0);
  assert.deepEqual(mutations(state), []);
});

test('migration failure stops every hosting deployment', async () => {
  const { config, state, runtime } = fixture({ migrationFails: true });
  await assert.rejects(release(config, runtime), /Fixture migration failed/);
  assert.equal(state.migrated, 1);
  assert.deepEqual(mutations(state).map(call => call.provider), ['github']);
  assert.equal(state.smoked, 0);
});

test('complete release pins approved code and preserves existing worker settings and encrypted values', async () => {
  const { config, state, runtime } = fixture();
  const original = copy(state.app.spec);
  const result = await release(config, runtime);
  assert.equal(result.sha, SHA);
  assert.deepEqual(result.components.map(item => item.component), ['api', 'storefront', 'admin', 'worker']);
  assert.ok(result.components.every(item => item.sha === SHA));
  assert.equal(state.migrated, 1);
  assert.equal(state.smoked, 1);
  const put = mutations(state).find(call => call.provider === 'digitalocean');
  assert.equal(put.method, 'PUT');
  assert.equal(put.body.update_all_source_versions, true);
  original.workers[0].github.branch = config.branch;
  assert.deepEqual(put.body.spec, original);
  assert.deepEqual(mutations(state).filter(call => call.provider === 'digitalocean').map(call => call.method), ['PUT']);
  for (const call of mutations(state).filter(call => call.provider === 'vercel')) {
    assert.equal(call.body.gitSource.sha, SHA);
    assert.equal(call.body.target, 'production');
  }
  assert.doesNotMatch(state.logs.join('\n'), /fixture-secret|EV\[/);
});

test('main advancing after migrations start does not mix commits or abandon the pinned release', async () => {
  const { config, state, runtime } = fixture({ advanceMainDuringMigration: true });
  const result = await release(config, runtime);
  assert.equal(state.mainSha, OLD_SHA);
  assert.equal(state.smoked, 1);
  assert.ok(result.components.every(item => item.sha === SHA));
  assert.ok(mutations(state).filter(call => call.provider === 'vercel').every(call => call.body.gitSource.sha === SHA));
});

test('main advancing while the immutable release branch is created skips database and hosting updates', async () => {
  const { config, state, runtime } = fixture({ advanceMainOnMutation: true });
  assert.deepEqual(await release(config, runtime), { skipped: true, sha: SHA });
  assert.equal(state.mainSha, OLD_SHA);
  assert.equal(state.branchSha, SHA);
  assert.equal(state.migrated, 0);
  assert.equal(state.smoked, 0);
  assert.deepEqual(mutations(state).map(call => call.provider), ['github']);
});

test('wrong Vercel deployed SHA stops worker deployment and final smoke', async () => {
  const { config, state, runtime } = fixture({ wrongVercelSha: true });
  await assert.rejects(release(config, runtime), /api deployed a different commit/);
  assert.deepEqual(mutations(state).filter(call => call.provider === 'digitalocean'), []);
  assert.equal(state.smoked, 0);
});

test('unexpected Vercel alias ownership stops the release before worker mutation', async () => {
  const { config, state, runtime } = fixture({ wrongAliasOwner: true });
  await assert.rejects(release(config, runtime), /domain ownership/);
  assert.deepEqual(mutations(state).filter(call => call.provider === 'digitalocean'), []);
  assert.equal(state.smoked, 0);
});

test('worker reporting another SHA never passes final smoke', async () => {
  const { config, state, runtime } = fixture({ wrongWorkerSha: true });
  await assert.rejects(release(config, runtime), /Worker deployed a different commit/);
  assert.equal(state.smoked, 0);
});

test('a ready worker deployment must also be the app active deployment', async () => {
  const { config, state, runtime } = fixture({ wrongActiveWorker: true });
  await assert.rejects(release(config, runtime), /active worker does not match/);
  assert.equal(state.smoked, 0);
});

test('already active approved worker is idempotent and avoids DigitalOcean mutations', async () => {
  const { config, state, runtime } = fixture({ existingBranch: `staging-release/${SHA}`, existingSha: SHA });
  const result = await release(config, runtime);
  assert.equal(result.components.find(item => item.component === 'worker').id, OLD_DEPLOYMENT);
  assert.deepEqual(mutations(state).filter(call => call.provider === 'digitalocean'), []);
  assert.equal(state.smoked, 1);
});

test('rerunning a pinned branch with stale active code creates one deployment without changing its spec', async () => {
  const { config, state, runtime } = fixture({ existingBranch: `staging-release/${SHA}` });
  const original = copy(state.app.spec);
  await release(config, runtime);
  assert.deepEqual(mutations(state).filter(call => call.provider === 'digitalocean').map(call => call.method), ['POST']);
  assert.deepEqual(state.app.spec, original);
});

test('a settings change during frontend builds aborts worker mutation', async () => {
  const { config, state, runtime } = fixture({ settingsRace: true });
  await assert.rejects(release(config, runtime), /Worker settings changed during release/);
  assert.deepEqual(mutations(state).filter(call => call.provider === 'digitalocean'), []);
  assert.equal(state.smoked, 0);
});

test('deployment polling has a bounded deadline even if a provider never becomes ready', async () => {
  const { config, state, runtime } = fixture({ vercelNeverReady: true });
  await assert.rejects(release(config, runtime), /timed out/);
  assert.ok(state.elapsed >= 900000);
  assert.ok(state.elapsed <= 930000);
  assert.equal(state.smoked, 0);
  assert.deepEqual(mutations(state).filter(call => call.provider === 'digitalocean'), []);
});

test('preflight rejects an unintended project root, an additional worker app resource, and provider push deployment', async t => {
  await t.test('production worker app identity', async () => {
    const { config, state, runtime } = fixture();
    state.app.spec.name = 'showhunt-production-worker';
    await assert.rejects(preflight(config, runtime), /existing showhunt-staging-worker DigitalOcean app/);
    assert.deepEqual(mutations(state), []);
  });
  await t.test('wrong project root', async () => {
    const { config, state, runtime } = fixture({ wrongProjectRoot: true });
    await assert.rejects(preflight(config, runtime), /project root and Git connection/);
    assert.deepEqual(mutations(state), []);
  });
  await t.test('additional compute', async () => {
    const { config, state, runtime } = fixture();
    state.app.spec.services = [{ name: 'unrelated-paid-service' }];
    await assert.rejects(preflight(config, runtime), /no additional resources/);
    assert.deepEqual(mutations(state), []);
  });
  await t.test('automatic worker deployment', async () => {
    const { config, state, runtime } = fixture();
    state.app.spec.workers[0].github.deploy_on_push = true;
    await assert.rejects(preflight(config, runtime), /Disable worker deployment on push/);
    assert.deepEqual(mutations(state), []);
  });
});

test('provider failures never surface response bodies, network details, or credentials', async t => {
  const config = configuration(env());
  await t.test('HTTP error body remains unread', async () => {
    let bodyRead = false;
    const client = providerClient(config, async () => ({ ok: false, status: 500,
      json: async () => { bodyRead = true; return { message: 'database-fixture-secret' }; },
      text: async () => { bodyRead = true; return 'database-fixture-secret'; } }));
    await assert.rejects(client('digitalocean', `/v2/apps/${APP_ID}`), error => {
      assert.match(error.message, /HTTP 500/);
      assert.doesNotMatch(error.message, /fixture-secret/);
      return true;
    });
    assert.equal(bodyRead, false);
  });
  await t.test('network error is replaced with a safe message', async () => {
    const client = providerClient(config, async () => { throw new Error('Bearer do-fixture-secret database-fixture-secret'); });
    await assert.rejects(client('digitalocean', `/v2/apps/${APP_ID}`), error => {
      assert.doesNotMatch(error.message, /fixture-secret/);
      assert.match(error.message, /request failed/);
      return true;
    });
  });
  await t.test('foreign origin rejected before sending any token', async () => {
    let called = false;
    const client = providerClient(config, async () => { called = true; });
    await assert.rejects(client('digitalocean', 'https://unrelated.example/v2/apps'), /expected origin/);
    assert.equal(called, false);
  });
});

test('configuration requires a direct verified Neon URL and trusted main push context', async () => {
  assert.equal(configuration(env()).sha, SHA);
  const invalid = [
    { STAGING_DATABASE_DIRECT_URL: env().STAGING_DATABASE_DIRECT_URL.replace('ep-staging.', 'ep-staging-pooler.') },
    { STAGING_DATABASE_DIRECT_URL: env().STAGING_DATABASE_DIRECT_URL.replace('verify-full', 'require') },
    { STAGING_DATABASE_DIRECT_URL: env().STAGING_DATABASE_DIRECT_URL.replace('neon.tech', 'example.com') },
    { GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_REF: 'refs/heads/staging' }, { STAGING_DEPLOY_ENABLED: 'false' },
  ];
  for (const change of invalid) assert.throws(() => configuration({ ...env(), ...change }), ReleaseError);
});

function smokeFixture(options = {}) {
  const config = configuration(env());
  const seen = [];
  const fetcher = async (address, init) => {
    const url = new URL(address);
    seen.push({ url, init });
    if (url.pathname.startsWith('/health/')) {
      const headers = { 'x-request-id': init.headers['X-Request-ID'], 'cache-control': 'no-store' };
      return new Response(JSON.stringify({ status: 'ok' }), {
        status: options.readinessFails && url.pathname === '/health/ready' ? 503 : 200, headers,
      });
    }
    if (url.pathname.startsWith('/api/v1/docs')) return new Response('docs', { status: options.docsExposed ? 200 : 404 });
    if (url.pathname === '/') return new Response('<html><title>ShowHunt staging</title></html>', { status: 200 });
    return new Response(options.wrongBrandAsset && url.pathname.endsWith('.svg') ? 'old-brand' : asset(url.pathname), { status: 200 });
  };
  return { config, seen, runtime: { fetcher, root: '/fixture', read: async path => asset(path) } };
}

test('production HTTPS smoke verifies readiness, hidden docs, pages, request IDs, and exact tested branding', async () => {
  const { config, seen, runtime } = smokeFixture();
  await smoke(config, runtime);
  assert.equal(seen.length, 12);
  assert.ok(seen.every(({ url, init }) => url.protocol === 'https:' && init.redirect === 'error'
    && init.headers['X-Request-ID'] === `staging-${SHA}`));
});

test('HTTPS smoke fails when database readiness fails', async () => {
  const { config, runtime } = smokeFixture({ readinessFails: true });
  await assert.rejects(smoke(config, runtime), /health\/ready.*failed/);
});

test('HTTPS smoke fails when production documentation is exposed', async () => {
  const { config, runtime } = smokeFixture({ docsExposed: true });
  await assert.rejects(smoke(config, runtime), /documentation is exposed/);
});

test('HTTPS smoke fails when a branded asset belongs to another commit', async () => {
  const { config, runtime } = smokeFixture({ wrongBrandAsset: true });
  await assert.rejects(smoke(config, runtime), /asset differs from the tested commit/);
});
