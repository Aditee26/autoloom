// No ALLOW_PRIVATE_HTTP here: the SSRF guard is fully active.
const { app, request, connect, disconnect, clear, registerUser, authed } = require('./setup');
const { branching, manual } = require('./fixtures');
const { node, edge } = require('../helpers');
const Integration = require('../../models/Integration');

beforeAll(connect);
afterAll(disconnect);
beforeEach(clear);

const create = (u, body) => request(app).post('/api/workflows').set(authed(u.token)).send(body);

describe('cross-user isolation', () => {
  test("user B cannot read, modify, run, delete or see executions of user A's resources", async () => {
    const a = await registerUser();
    const b = await registerUser();
    const wf = (await create(a, manual())).body.data;
    const ex = (await request(app).post(`/api/workflows/${wf.id}/execute`).set(authed(a.token)).send({ input: {} })).body.data;
    const integ = (await request(app).post('/api/integrations').set(authed(a.token)).send({ name: 'A API', configuration: { url: 'https://api.example.com', method: 'POST' } })).body.data;

    const attempts = [
      request(app).get(`/api/workflows/${wf.id}`).set(authed(b.token)),
      request(app).put(`/api/workflows/${wf.id}`).set(authed(b.token)).send({ name: 'hijacked' }),
      request(app).delete(`/api/workflows/${wf.id}`).set(authed(b.token)),
      request(app).post(`/api/workflows/${wf.id}/duplicate`).set(authed(b.token)),
      request(app).patch(`/api/workflows/${wf.id}/status`).set(authed(b.token)).send({ status: 'active' }),
      request(app).post(`/api/workflows/${wf.id}/execute`).set(authed(b.token)).send({}),
      request(app).get(`/api/executions/${ex._id}`).set(authed(b.token)),
      request(app).post(`/api/executions/${ex._id}/retry`).set(authed(b.token)),
      request(app).post(`/api/executions/${ex._id}/cancel`).set(authed(b.token)),
      request(app).put(`/api/integrations/${integ.id}`).set(authed(b.token)).send({ name: 'x', configuration: { url: 'https://api.example.com' } }),
      request(app).delete(`/api/integrations/${integ.id}`).set(authed(b.token)),
    ];
    const results = await Promise.all(attempts);
    results.forEach((r) => expect(r.status).toBe(404)); // 404, not 403: existence is not revealed

    expect((await request(app).get('/api/workflows').set(authed(b.token))).body.data).toEqual([]);
    expect((await request(app).get('/api/executions').set(authed(b.token))).body.data).toEqual([]);
    expect((await request(app).get('/api/integrations').set(authed(b.token))).body.data).toEqual([]);
    expect((await request(app).get(`/api/executions?workflowId=${wf.id}`).set(authed(b.token))).body.data).toEqual([]);

    const still = await request(app).get(`/api/workflows/${wf.id}`).set(authed(a.token));
    expect(still.body.data.name).toBe('Manual flow'); // untouched
  });

  test('dashboard numbers are per-user', async () => {
    const a = await registerUser();
    const b = await registerUser();
    const wf = (await create(a, manual())).body.data;
    await request(app).post(`/api/workflows/${wf.id}/execute`).set(authed(a.token)).send({});
    const sb = await request(app).get('/api/dashboard/stats').set(authed(b.token));
    expect(sb.body.data.workflows.total).toBe(0);
    expect(sb.body.data.executions.total).toBe(0);
  });
});

describe('SSRF protection through the API', () => {
  const blocked = ['http://localhost:5000/api/auth/me', 'http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data/', 'http://10.0.0.1/', 'http://[::1]/', 'file:///etc/passwd', 'http://metadata.google.internal/'];

  test('integrations with unsafe URLs are rejected at save time', async () => {
    const u = await registerUser();
    for (const url of blocked) {
      const r = await request(app).post('/api/integrations').set(authed(u.token)).send({ name: `n-${url}`.slice(0, 70), configuration: { url, method: 'GET' } });
      expect(r.status).toBe(400);
    }
  });

  test('a stored workflow with an unsafe literal URL cannot be executed', async () => {
    const u = await registerUser();
    for (const url of blocked) {
      const wf = await create(u, { name: 'ssrf', nodes: [node('t', 'manualTrigger'), node('h', 'httpRequest', { url })], edges: [edge('t', 'h')] });
      expect(wf.status).toBe(201); // drafts may be saved...
      const run = await request(app).post(`/api/workflows/${wf.body.data.id}/execute`).set(authed(u.token)).send({});
      expect(run.status).toBe(422); // ...but are refused by validation before running
    }
  });

  test('templated URLs bypass static validation but are blocked at run time', async () => {
    const u = await registerUser();
    const wf = await create(u, { name: 'dyn', nodes: [node('t', 'manualTrigger'), node('h', 'httpRequest', { url: '{{trigger.body.target}}' })], edges: [edge('t', 'h')] });
    for (const target of ['http://127.0.0.1:1/', 'http://169.254.169.254/', 'http://localhost/']) {
      const run = await request(app).post(`/api/workflows/${wf.body.data.id}/execute`).set(authed(u.token)).send({ input: { target } });
      expect(run.status).toBe(201);
      expect(run.body.data.status).toBe('failed');
      expect(run.body.data.nodeResults[1].error).toMatch(/not allowed|blocked/i);
    }
  });

  test('DNS that resolves to a private address is blocked (localhost-resolving name)', async () => {
    const u = await registerUser();
    // "localtest.me"-style names can't be assumed to resolve offline, so use the OS resolver's own localhost alias.
    const wf = await create(u, { name: 'dns', nodes: [node('t', 'manualTrigger'), node('h', 'httpRequest', { url: '{{trigger.body.t}}' })], edges: [edge('t', 'h')] });
    const run = await request(app).post(`/api/workflows/${wf.body.data.id}/execute`).set(authed(u.token)).send({ input: { t: 'http://ip6-localhost:80/' } });
    expect(run.body.data.status).toBe('failed');
  });
});

describe('integrations and secret handling', () => {
  test('secret is encrypted at rest and never returned', async () => {
    const u = await registerUser();
    const res = await request(app).post('/api/integrations').set(authed(u.token)).send({ name: 'Billing API', configuration: { url: 'https://api.example.com/v1', method: 'POST', authType: 'bearer' }, secret: 'sk_live_supersecret' });
    expect(res.status).toBe(201);
    expect(JSON.stringify(res.body)).not.toContain('sk_live_supersecret');
    expect(res.body.data.hasSecret).toBe(true);
    const raw = await Integration.findById(res.body.data.id).select('+encryptedCredentials').lean();
    expect(raw.encryptedCredentials).toBeDefined();
    expect(raw.encryptedCredentials).not.toContain('sk_live_supersecret');
    const list = await request(app).get('/api/integrations').set(authed(u.token));
    expect(JSON.stringify(list.body)).not.toMatch(/sk_live|encryptedCredentials/);
    expect(list.body.data[0]).toMatchObject({ name: 'Billing API', hasSecret: true, lastUsedAt: null });
  });
  test('auth type requires a secret; update keeps the secret when omitted; delete works', async () => {
    const u = await registerUser();
    expect((await request(app).post('/api/integrations').set(authed(u.token)).send({ name: 'x', configuration: { url: 'https://api.example.com', authType: 'apiKey' } })).status).toBe(400);
    const c = await request(app).post('/api/integrations').set(authed(u.token)).send({ name: 'Keyed', configuration: { url: 'https://api.example.com', authType: 'apiKey', apiKeyHeader: 'X-Api-Key' }, secret: 'k1' });
    const upd = await request(app).put(`/api/integrations/${c.body.data.id}`).set(authed(u.token)).send({ name: 'Keyed 2', configuration: { url: 'https://api.example.com/v2', authType: 'apiKey', apiKeyHeader: 'X-Api-Key' } });
    expect(upd.status).toBe(200);
    expect(upd.body.data.hasSecret).toBe(true);
    expect((await request(app).post('/api/integrations').set(authed(u.token)).send({ name: 'bad', configuration: { url: 'https://a.com', apiKeyHeader: 'bad header!' } })).status).toBe(400);
    expect((await request(app).delete(`/api/integrations/${c.body.data.id}`).set(authed(u.token))).status).toBe(200);
  });
});

describe('malformed input', () => {
  test('malformed JSON and oversized bodies are rejected cleanly', async () => {
    const u = await registerUser();
    const bad = await request(app).post('/api/workflows').set(authed(u.token)).set('Content-Type', 'application/json').send('{"name":');
    expect(bad.status).toBe(400);
    const huge = await request(app).post('/api/workflows').set(authed(u.token)).send({ name: 'x', description: 'y'.repeat(2 * 1024 * 1024) });
    expect(huge.status).toBe(413);
    expect(bad.body.stack).toBeUndefined();
  });
  test('NoSQL operators in query/body are neutralised', async () => {
    const u = await registerUser();
    const r = await request(app).get('/api/workflows?status[$ne]=x').set(authed(u.token));
    expect(r.status).toBe(400);
    const e = await request(app).get('/api/executions?workflowId[$ne]=1').set(authed(u.token));
    expect(e.status).toBe(400);
  });
  test('unknown routes return JSON 404/401, never HTML or stack traces', async () => {
    const r = await request(app).get('/api/nope');
    expect([401, 404]).toContain(r.status);
    expect(r.headers['content-type']).toMatch(/json/);
    expect((await request(app).get('/api/health')).body.status).toBe('ok');
    expect((await request(app).get('/api/health')).headers['x-powered-by']).toBeUndefined();
  });
});

describe('templates and dashboard', () => {
  const { seedTemplates } = require('../../utils/seedTemplates');
  const { validateWorkflow } = require('../../services/workflowEngine/validator');

  test('all six templates are seeded, valid, and cloneable into editable workflows', async () => {
    expect(await seedTemplates()).toBe(6);
    expect(await seedTemplates()).toBe(6); // idempotent
    const u = await registerUser();
    const list = await request(app).get('/api/templates').set(authed(u.token));
    expect(list.body.data).toHaveLength(6);
    expect(list.body.data.map((t) => t.name)).toEqual(expect.arrayContaining(['Webhook to HTTP Notification', 'Customer Registration Handler', 'Conditional Email Routing', 'Scheduled API Health Check', 'Data Validation Workflow', 'Simple HTTP Request Automation']));
    for (const t of list.body.data) {
      const full = (await request(app).get(`/api/templates/${t._id}`).set(authed(u.token))).body.data;
      expect(validateWorkflow(full)).toMatchObject({ valid: true, errors: [] });
      const clone = await request(app).post(`/api/templates/${t._id}/clone`).set(authed(u.token)).send({});
      expect(clone.status).toBe(201);
      expect(clone.body.data.status).toBe('inactive');
      expect(clone.body.data.nodes.length).toBe(full.nodes.length);
      const edit = await request(app).put(`/api/workflows/${clone.body.data.id}`).set(authed(u.token)).send({ name: `${t.name} (mine)` });
      expect(edit.body.data.name).toBe(`${t.name} (mine)`);
    }
    expect((await request(app).post(`/api/templates/${'0'.repeat(24)}/clone`).set(authed(u.token))).status).toBe(404);
  });

  test('stats and analytics come from real records (and empty state is zeros)', async () => {
    const u = await registerUser();
    const empty = await request(app).get('/api/dashboard/stats').set(authed(u.token));
    expect(empty.body.data).toMatchObject({ workflows: { total: 0, active: 0, inactive: 0 }, executions: { total: 0, success: 0, failed: 0, successRate: null } });

    const ok = (await create(u, manual())).body.data;
    const bad = (await create(u, { name: 'Failing', nodes: [node('t', 'manualTrigger'), node('v', 'setVariable', { name: 'n', value: 'abc', valueType: 'number' })], edges: [edge('t', 'v')] })).body.data;
    const wh = (await create(u, branching())).body.data;
    await request(app).patch(`/api/workflows/${wh.id}/status`).set(authed(u.token)).send({ status: 'active' });
    for (let i = 0; i < 3; i += 1) await request(app).post(`/api/workflows/${ok.id}/execute`).set(authed(u.token)).send({});
    await request(app).post(`/api/workflows/${bad.id}/execute`).set(authed(u.token)).send({});

    const stats = (await request(app).get('/api/dashboard/stats').set(authed(u.token))).body.data;
    expect(stats.workflows).toEqual({ total: 3, active: 1, inactive: 2 });
    expect(stats.executions).toMatchObject({ total: 4, success: 3, failed: 1, successRate: 75 });
    expect(stats.recentExecutions).toHaveLength(4);
    const recent = stats.recentWorkflows.find((w) => w.id === ok.id);
    expect(recent.totalExecutions).toBe(3);
    expect(recent.lastExecutedAt).not.toBeNull();

    const an = (await request(app).get('/api/dashboard/analytics?days=7').set(authed(u.token))).body.data;
    expect(an.daily).toHaveLength(7);
    const today = an.daily.at(-1);
    expect(today).toMatchObject({ total: 4, success: 3, failed: 1, activeWorkflows: 2 });
    expect(an.topWorkflows[0]).toMatchObject({ name: 'Manual flow', executions: 3 });
  });
});
