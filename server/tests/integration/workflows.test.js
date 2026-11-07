const { app, request, connect, disconnect, clear, registerUser, authed } = require('./setup');
const { branching, manual } = require('./fixtures');
const { node, edge } = require('../helpers');
const scheduler = require('../../services/scheduler');

beforeAll(connect);
afterAll(async () => { scheduler.stopAll(); await disconnect(); });
beforeEach(clear);

const create = (u, body) => request(app).post('/api/workflows').set(authed(u.token)).send(body);

describe('workflow management', () => {
  test('create, get, update persist canvas state and reload identically', async () => {
    const u = await registerUser();
    const body = branching();
    const created = await create(u, body);
    expect(created.status).toBe(201);
    expect(created.body.data.triggerType).toBe('webhook');
    expect(created.body.data.webhookId).toMatch(/^[a-f0-9]{48}$/);
    expect(created.body.data.webhookUrl).toContain(`/api/webhooks/${created.body.data.webhookId}`);
    const id = created.body.data.id;

    const got = await request(app).get(`/api/workflows/${id}`).set(authed(u.token));
    expect(got.body.data.nodes).toHaveLength(5);
    expect(got.body.data.edges.map((e) => [e.source, e.target, e.sourceHandle])).toEqual(body.edges.map((e) => [e.source, e.target, e.sourceHandle]));
    expect(got.body.data.validation.valid).toBe(true);

    const moved = body.nodes.map((n) => (n.id === 'check' ? { ...n, position: { x: 321, y: 123 }, selected: true, dragging: true } : n));
    const upd = await request(app).put(`/api/workflows/${id}`).set(authed(u.token)).send({ name: 'Renamed', nodes: moved });
    expect(upd.status).toBe(200);
    const again = await request(app).get(`/api/workflows/${id}`).set(authed(u.token));
    expect(again.body.data.name).toBe('Renamed');
    const check = again.body.data.nodes.find((n) => n.id === 'check');
    expect(check.position).toEqual({ x: 321, y: 123 });
    expect(check.selected).toBeUndefined(); // transient UI state is not persisted
    expect(again.body.data.webhookId).toBe(created.body.data.webhookId); // stable across saves
  });

  test('draft workflows can be saved while invalid, and report validation errors', async () => {
    const u = await registerUser();
    const res = await create(u, { name: 'Draft', nodes: [node('a', 'logMessage', { message: 'x' })], edges: [] });
    expect(res.status).toBe(201);
    const got = await request(app).get(`/api/workflows/${res.body.data.id}`).set(authed(u.token));
    expect(got.body.data.validation.valid).toBe(false);
    expect(got.body.data.validation.errors.join()).toMatch(/trigger/);
  });

  test('input validation', async () => {
    const u = await registerUser();
    expect((await create(u, { name: '' })).status).toBe(400);
    expect((await create(u, { name: 'x', nodes: 'nope' })).status).toBe(400);
    expect((await request(app).get('/api/workflows/not-an-id').set(authed(u.token))).status).toBe(400);
  });

  test('list supports search, status filter, sort and execution counts', async () => {
    const u = await registerUser();
    await create(u, { ...manual(), name: 'Alpha sync' });
    const b = await create(u, { ...branching(), name: 'Beta handler' });
    await request(app).patch(`/api/workflows/${b.body.data.id}/status`).set(authed(u.token)).send({ status: 'active' });
    const all = await request(app).get('/api/workflows').set(authed(u.token));
    expect(all.body.data).toHaveLength(2);
    expect((await request(app).get('/api/workflows?search=alpha').set(authed(u.token))).body.data.map((w) => w.name)).toEqual(['Alpha sync']);
    expect((await request(app).get('/api/workflows?status=active').set(authed(u.token))).body.data.map((w) => w.name)).toEqual(['Beta handler']);
    expect((await request(app).get('/api/workflows?sort=name').set(authed(u.token))).body.data.map((w) => w.name)).toEqual(['Alpha sync', 'Beta handler']);
    expect((await request(app).get('/api/workflows?search=.*').set(authed(u.token))).body.data).toHaveLength(0); // regex is escaped
    expect(all.body.data[0].totalExecutions).toBe(0);
  });

  test('duplicate creates an inactive copy with a new webhook id', async () => {
    const u = await registerUser();
    const orig = await create(u, branching());
    await request(app).patch(`/api/workflows/${orig.body.data.id}/status`).set(authed(u.token)).send({ status: 'active' });
    const dup = await request(app).post(`/api/workflows/${orig.body.data.id}/duplicate`).set(authed(u.token));
    expect(dup.status).toBe(201);
    expect(dup.body.data.name).toMatch(/\(Copy\)$/);
    expect(dup.body.data.status).toBe('inactive');
    expect(dup.body.data.webhookId).not.toBe(orig.body.data.webhookId);
    expect(dup.body.data.nodes).toHaveLength(5);
  });

  test('activate/deactivate with validation gate', async () => {
    const u = await registerUser();
    const bad = await create(u, { name: 'bad', nodes: [node('t', 'webhookTrigger')], edges: [] });
    const refuse = await request(app).patch(`/api/workflows/${bad.body.data.id}/status`).set(authed(u.token)).send({ status: 'active' });
    expect(refuse.status).toBe(422);
    const good = await create(u, branching());
    const on = await request(app).patch(`/api/workflows/${good.body.data.id}/status`).set(authed(u.token)).send({ status: 'active' });
    expect(on.body.data.status).toBe('active');
    const off = await request(app).patch(`/api/workflows/${good.body.data.id}/status`).set(authed(u.token)).send({ status: 'inactive' });
    expect(off.body.data.status).toBe('inactive');
    expect((await request(app).patch(`/api/workflows/${good.body.data.id}/status`).set(authed(u.token)).send({ status: 'paused' })).status).toBe(400);
    const man = await create(u, manual());
    expect((await request(app).patch(`/api/workflows/${man.body.data.id}/status`).set(authed(u.token)).send({ status: 'active' })).status).toBe(422);
  });

  test('an active workflow that is edited into an invalid state is deactivated', async () => {
    const u = await registerUser();
    const wf = await create(u, branching());
    await request(app).patch(`/api/workflows/${wf.body.data.id}/status`).set(authed(u.token)).send({ status: 'active' });
    const upd = await request(app).put(`/api/workflows/${wf.body.data.id}`).set(authed(u.token)).send({ edges: [] });
    expect(upd.body.data.status).toBe('inactive');
  });

  test('delete removes the workflow', async () => {
    const u = await registerUser();
    const wf = await create(u, manual());
    expect((await request(app).delete(`/api/workflows/${wf.body.data.id}`).set(authed(u.token))).status).toBe(200);
    expect((await request(app).get(`/api/workflows/${wf.body.data.id}`).set(authed(u.token))).status).toBe(404);
  });
});

describe('scheduler registration', () => {
  const scheduled = (extra = {}) => ({
    name: 'Scheduled',
    nodes: [node('t', 'scheduleTrigger', { mode: 'custom', cron: '*/5 * * * *', ...extra }), node('l', 'logMessage', { message: 'tick' })],
    edges: [edge('t', 'l')],
  });

  test('only active workflows are registered, never duplicated, and cleaned up', async () => {
    const u = await registerUser();
    const wf = await create(u, scheduled());
    const id = wf.body.data.id;
    expect(scheduler.isRegistered(id)).toBe(false); // inactive
    await request(app).patch(`/api/workflows/${id}/status`).set(authed(u.token)).send({ status: 'active' });
    expect(scheduler.isRegistered(id)).toBe(true);
    expect(scheduler.size()).toBe(1);
    await request(app).patch(`/api/workflows/${id}/status`).set(authed(u.token)).send({ status: 'active' });
    await request(app).put(`/api/workflows/${id}`).set(authed(u.token)).send({ name: 'Scheduled v2' });
    expect(scheduler.size()).toBe(1); // re-registration replaces, never stacks
    await request(app).put(`/api/workflows/${id}`).set(authed(u.token)).send({ nodes: scheduled({ cron: '0 * * * *' }).nodes });
    expect(scheduler.expressionFor(id)).toBe('0 * * * *');
    await request(app).patch(`/api/workflows/${id}/status`).set(authed(u.token)).send({ status: 'inactive' });
    expect(scheduler.isRegistered(id)).toBe(false);
    await request(app).patch(`/api/workflows/${id}/status`).set(authed(u.token)).send({ status: 'active' });
    await request(app).delete(`/api/workflows/${id}`).set(authed(u.token));
    expect(scheduler.size()).toBe(0);
  });

  test('invalid cron is refused on activation', async () => {
    const u = await registerUser();
    const wf = await create(u, scheduled({ cron: 'bogus' }));
    const res = await request(app).patch(`/api/workflows/${wf.body.data.id}/status`).set(authed(u.token)).send({ status: 'active' });
    expect(res.status).toBe(422);
    expect(scheduler.size()).toBe(0);
  });

  test('a scheduled tick runs through the same engine and records an execution', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    jest.useRealTimers();
    const u = await registerUser();
    const wf = await create(u, scheduled({ mode: 'custom', cron: '* * * * * *' })); // every second (node-cron supports seconds)
    await request(app).patch(`/api/workflows/${wf.body.data.id}/status`).set(authed(u.token)).send({ status: 'active' });
    let list;
    for (let i = 0; i < 40; i += 1) {
      await new Promise((r) => setTimeout(r, 250));
      list = await request(app).get('/api/executions?triggerType=schedule').set(authed(u.token));
      if (list.body.data.length) break;
    }
    scheduler.stopAll();
    expect(list.body.data.length).toBeGreaterThanOrEqual(1);
    expect(list.body.data[0]).toMatchObject({ triggerType: 'schedule', status: 'success' });
  }, 20000);
});
