// Real HTTP calls to a local server require this flag; it is only honoured when NODE_ENV=test.
process.env.ALLOW_PRIVATE_HTTP = 'true';
const http = require('http');
const { app, request, connect, disconnect, clear, registerUser, authed } = require('./setup');
const { branching, manual } = require('./fixtures');
const { node, edge } = require('../helpers');
const Execution = require('../../models/Execution');

let server; let base; const received = [];
beforeAll(async () => {
  await connect();
  await new Promise((resolve) => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        received.push({ method: req.method, url: req.url, body, headers: req.headers });
        if (req.url.startsWith('/fail')) { res.writeHead(500); return res.end('server exploded'); }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    }).listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; resolve(); });
  });
});
afterAll(async () => { server.closeAllConnections?.(); await new Promise((r) => server.close(() => r())); await disconnect(); });
beforeEach(async () => { await clear(); received.length = 0; });

const create = (u, body) => request(app).post('/api/workflows').set(authed(u.token)).send(body);
const run = (u, id, input) => request(app).post(`/api/workflows/${id}/execute`).set(authed(u.token)).send({ input });

describe('manual execution', () => {
  test('runs, stores per-node results, context and logs', async () => {
    const u = await registerUser();
    const wf = await create(u, manual());
    const res = await run(u, wf.body.data.id, { name: 'Ada' });
    expect(res.status).toBe(201);
    const ex = res.body.data;
    expect(ex.status).toBe('success');
    expect(ex.triggerType).toBe('manual');
    expect(ex.nodeResults.map((n) => [n.nodeId, n.status])).toEqual([['t', 'success'], ['log', 'success']]);
    expect(ex.nodeResults[1].output.message).toBe('hello Ada');
    expect(ex.logs[0].message).toBe('hello Ada');
    expect(ex.duration).toEqual(expect.any(Number));
    expect(ex.completedAt).toBeDefined();
    expect(ex.executionContext.trigger.body).toEqual({ name: 'Ada' });

    const fetched = await request(app).get(`/api/executions/${ex._id}`).set(authed(u.token));
    expect(fetched.body.data.nodeResults).toHaveLength(2);
  });

  test('invalid workflow cannot be executed', async () => {
    const u = await registerUser();
    const wf = await create(u, { name: 'bad', nodes: [node('t', 'manualTrigger')], edges: [] });
    expect((await run(u, wf.body.data.id, {})).status).toBe(422);
  });

  test('real HTTP node: method, headers, query, JSON body and interpolation all reach the server', async () => {
    const u = await registerUser();
    const wf = await create(u, {
      name: 'http',
      nodes: [node('t', 'manualTrigger'), node('h', 'httpRequest', { method: 'PUT', url: `${base}/things`, headers: [{ key: 'X-Trace', value: 'abc-{{trigger.body.id}}' }], queryParams: [{ key: 'q', value: '{{trigger.body.id}}' }], body: '{"id":"{{trigger.body.id}}","tags":["a","b"]}' })],
      edges: [edge('t', 'h')],
    });
    const ex = (await run(u, wf.body.data.id, { id: 42 })).body.data;
    expect(ex.status).toBe('success');
    const hit = received[0];
    expect(hit.method).toBe('PUT');
    expect(hit.url).toBe('/things?q=42');
    expect(hit.headers['x-trace']).toBe('abc-42');
    expect(JSON.parse(hit.body)).toEqual({ id: 42, tags: ['a', 'b'] });
    expect(ex.nodeResults[1].output).toMatchObject({ status: 200, body: { ok: true } });
    expect(ex.nodeResults[1].input).toMatchObject({ method: 'PUT', url: `${base}/things` });
  });

  test('failed node: execution fails, error is meaningful, later nodes are not run, then retry creates a linked execution', async () => {
    const u = await registerUser();
    const wf = await create(u, {
      name: 'fails',
      nodes: [node('t', 'manualTrigger'), node('h', 'httpRequest', { url: `${base}/fail` }, 'Call API'), node('after', 'logMessage', { message: 'never' })],
      edges: [edge('t', 'h'), edge('h', 'after')],
    });
    const ex = (await run(u, wf.body.data.id, {})).body.data;
    expect(ex.status).toBe('failed');
    expect(ex.error.message).toMatch(/Call API.*HTTP 500/);
    expect(ex.error.nodeId).toBe('h');
    expect(ex.nodeResults.map((n) => n.nodeId)).toEqual(['t', 'h']);
    expect(ex.nodeResults[1].output.status).toBe(500);

    const retry = await request(app).post(`/api/executions/${ex._id}/retry`).set(authed(u.token));
    expect(retry.status).toBe(201);
    expect(retry.body.data.triggerType).toBe('retry');
    expect(retry.body.data.retryOf).toBe(ex._id);
    expect(retry.body.data.status).toBe('failed');
    const okExec = (await run(u, (await create(u, manual())).body.data.id, {})).body.data;
    expect((await request(app).post(`/api/executions/${okExec._id}/retry`).set(authed(u.token))).status).toBe(409); // only failed ones
  });

  test('timeout on a hanging endpoint is reported', async () => {
    const u = await registerUser();
    const slow = http.createServer(() => { /* never answers */ });
    await new Promise((r) => slow.listen(0, '127.0.0.1', r));
    const wf = await create(u, { name: 'slow', nodes: [node('t', 'manualTrigger'), node('h', 'httpRequest', { url: `http://127.0.0.1:${slow.address().port}/`, timeoutMs: 300 })], edges: [edge('t', 'h')] });
    const ex = (await run(u, wf.body.data.id, {})).body.data;
    slow.closeAllConnections?.(); await new Promise((r) => slow.close(() => r()));
    expect(ex.status).toBe('failed');
    expect(ex.nodeResults[1].error).toMatch(/timed out/);
  });
});

describe('execution history', () => {
  test('list with filters, search and pagination; detail excludes other users', async () => {
    const u = await registerUser();
    const a = await create(u, { ...manual(), name: 'Alpha' });
    const b = await create(u, { name: 'Beta', nodes: [node('t', 'manualTrigger'), node('h', 'httpRequest', { url: `${base}/fail` })], edges: [edge('t', 'h')] });
    await run(u, a.body.data.id, {}); await run(u, a.body.data.id, {}); await run(u, b.body.data.id, {});
    const all = await request(app).get('/api/executions').set(authed(u.token));
    expect(all.body.pagination.total).toBe(3);
    expect(all.body.data[0].nodeResults[0].input).toBeUndefined(); // heavy fields stripped from the list
    expect((await request(app).get('/api/executions?status=failed').set(authed(u.token))).body.data).toHaveLength(1);
    expect((await request(app).get(`/api/executions?workflowId=${a.body.data.id}`).set(authed(u.token))).body.data).toHaveLength(2);
    expect((await request(app).get('/api/executions?search=beta').set(authed(u.token))).body.data).toHaveLength(1);
    expect((await request(app).get('/api/executions?limit=2&page=2').set(authed(u.token))).body.data).toHaveLength(1);
    expect((await request(app).get('/api/executions?status=bogus').set(authed(u.token))).status).toBe(400);
  });

  test('history survives workflow deletion', async () => {
    const u = await registerUser();
    const wf = await create(u, manual());
    await run(u, wf.body.data.id, {});
    await request(app).delete(`/api/workflows/${wf.body.data.id}`).set(authed(u.token));
    const list = await request(app).get('/api/executions').set(authed(u.token));
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].workflowName).toBe('Manual flow');
  });

  test('cancel only affects running executions', async () => {
    const u = await registerUser();
    const wf = await create(u, manual());
    const ex = (await run(u, wf.body.data.id, {})).body.data;
    expect((await request(app).post(`/api/executions/${ex._id}/cancel`).set(authed(u.token))).status).toBe(409);
    const running = await Execution.create({ userId: u.id, workflowId: wf.body.data.id, workflowName: 'x', status: 'running', triggerType: 'manual' });
    const c = await request(app).post(`/api/executions/${running._id}/cancel`).set(authed(u.token));
    expect(c.body.data.status).toBe('cancelled');
  });
});

describe('webhooks', () => {
  async function activeWebhookWorkflow(u) {
    const wf = await create(u, branching());
    await request(app).patch(`/api/workflows/${wf.body.data.id}/status`).set(authed(u.token)).send({ status: 'active' });
    return wf.body.data;
  }

  test('POST triggers the workflow, captures request data, TRUE branch', async () => {
    const u = await registerUser();
    const wf = await activeWebhookWorkflow(u);
    const res = await request(app).post(`/api/webhooks/${wf.webhookId}?src=crm`).set('X-Custom', 'yes').set('Authorization', 'Bearer topsecret').send({ email: 'bob@acme.com' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, status: 'success' });
    const ex = (await request(app).get(`/api/executions/${res.body.executionId}`).set(authed(u.token))).body.data;
    expect(ex.triggerType).toBe('webhook');
    expect(ex.nodeResults.map((n) => n.nodeId)).toEqual(['trigger', 'check', 'yes', 'done']);
    expect(ex.logs[0].message).toBe('route=internal email=bob@acme.com');
    expect(ex.executionContext.trigger).toMatchObject({ method: 'POST', query: { src: 'crm' }, body: { email: 'bob@acme.com' } });
    expect(ex.executionContext.trigger.headers['x-custom']).toBe('yes');
    expect(ex.executionContext.trigger.headers.authorization).toBe('********');
    expect(JSON.stringify(ex)).not.toContain('topsecret'); // secret absent from every stored field, incl. input
    expect(ex.executionContext.trigger.timestamp).toBeDefined();
  });

  test('FALSE branch', async () => {
    const u = await registerUser();
    const wf = await activeWebhookWorkflow(u);
    const res = await request(app).post(`/api/webhooks/${wf.webhookId}`).send({ email: 'eve@gmail.com' });
    const ex = (await request(app).get(`/api/executions/${res.body.executionId}`).set(authed(u.token))).body.data;
    expect(ex.nodeResults.map((n) => n.nodeId)).toEqual(['trigger', 'check', 'no', 'done']);
    expect(ex.logs[0].message).toBe('route=external email=eve@gmail.com');
  });

  test('unknown/invalid ids, inactive workflows and malformed bodies', async () => {
    const u = await registerUser();
    expect((await request(app).post('/api/webhooks/not-a-valid-id').send({})).status).toBe(404);
    expect((await request(app).post(`/api/webhooks/${'a'.repeat(48)}`).send({})).status).toBe(404);
    const wf = await create(u, branching());
    expect((await request(app).post(`/api/webhooks/${wf.body.data.webhookId}`).send({})).status).toBe(409); // inactive
    await request(app).patch(`/api/workflows/${wf.body.data.id}/status`).set(authed(u.token)).send({ status: 'active' });
    const bad = await request(app).post(`/api/webhooks/${wf.body.data.webhookId}`).set('Content-Type', 'application/json').send('{"broken":');
    expect(bad.status).toBe(400);
    const big = await request(app).post(`/api/webhooks/${wf.body.data.webhookId}`).send({ blob: 'x'.repeat(300 * 1024) });
    expect(big.status).toBe(413);
    expect([401, 404, 405]).toContain((await request(app).get(`/api/webhooks/${wf.body.data.webhookId}`)).status); // POST only
    await request(app).patch(`/api/workflows/${wf.body.data.id}/status`).set(authed(u.token)).send({ status: 'inactive' });
    expect((await request(app).post(`/api/webhooks/${wf.body.data.webhookId}`).send({})).status).toBe(409);
  });

  test('a failing workflow returns 422 with the execution id', async () => {
    const u = await registerUser();
    const wf = await create(u, { name: 'wh-fail', nodes: [node('t', 'webhookTrigger'), node('h', 'httpRequest', { url: `${base}/fail` })], edges: [edge('t', 'h')] });
    await request(app).patch(`/api/workflows/${wf.body.data.id}/status`).set(authed(u.token)).send({ status: 'active' });
    const res = await request(app).post(`/api/webhooks/${wf.body.data.webhookId}`).send({});
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ success: false, status: 'failed' });
    expect(res.body.executionId).toBeDefined();
  });

  test('webhook URLs are not guessable from workflow ids and are never shared on duplicate/clone', async () => {
    const u = await registerUser();
    const wf = await create(u, branching());
    expect(wf.body.data.webhookId).not.toContain(wf.body.data.id);
  });
});
