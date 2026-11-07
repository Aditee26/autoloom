// End-to-end smoke test against a RUNNING AutoLoom API (no mocks).
// Usage: BASE_URL=http://localhost:5000 node tests/e2e-smoke.mjs
const BASE = process.env.BASE_URL || 'http://localhost:5000';
let passed = 0; let failed = 0;
const check = (name, cond, extra = '') => { if (cond) { passed += 1; console.log(`  ok   ${name}`); } else { failed += 1; console.log(`  FAIL ${name} ${extra}`); } };
const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log(`AutoLoom E2E smoke test -> ${BASE}`);
  const email = `e2e_${Date.now()}@example.com`;

  console.log('\n[1] Auth');
  const reg = await call('POST', '/api/auth/register', { body: { name: 'E2E User', email, password: 'Passw0rd!123' } });
  check('register', reg.status === 201 && reg.body.data.token);
  const token = reg.body.data.token;
  check('login', (await call('POST', '/api/auth/login', { body: { email, password: 'Passw0rd!123' } })).status === 200);
  check('bad login rejected', (await call('POST', '/api/auth/login', { body: { email, password: 'nope-nope' } })).status === 401);
  check('protected route needs token', (await call('GET', '/api/workflows')).status === 401);

  console.log('\n[2] Templates (seeded at startup)');
  const tpls = await call('GET', '/api/templates', { token });
  check('six templates available', tpls.body.data.length === 6, `got ${tpls.body.data?.length}`);
  const reg2 = tpls.body.data.find((t) => t.name === 'Customer Registration Handler');
  const clone = await call('POST', `/api/templates/${reg2._id}/clone`, { token, body: {} });
  check('clone template into editable workflow', clone.status === 201 && clone.body.data.nodes.length === 5);

  console.log('\n[3] Build a workflow: webhook -> condition -> TRUE / FALSE paths');
  const wfBody = {
    name: 'E2E registration',
    nodes: [
      { id: 'trigger_1', type: 'webhookTrigger', position: { x: 0, y: 0 }, data: { label: 'Webhook', config: {} } },
      { id: 'condition_1', type: 'condition', position: { x: 250, y: 0 }, data: { label: 'Company email?', config: { field: '{{trigger.body.email}}', operator: 'contains', value: '@acme.com' } } },
      { id: 'variable_1', type: 'setVariable', position: { x: 500, y: -80 }, data: { label: 'Internal', config: { name: 'route', value: 'internal', valueType: 'string' } } },
      { id: 'variable_2', type: 'setVariable', position: { x: 500, y: 80 }, data: { label: 'External', config: { name: 'route', value: 'external', valueType: 'string' } } },
      { id: 'log_1', type: 'logMessage', position: { x: 750, y: 0 }, data: { label: 'Done', config: { level: 'info', message: '{{trigger.body.email}} -> {{variables.route}}' } } },
    ],
    edges: [
      { id: 'e1', source: 'trigger_1', target: 'condition_1' },
      { id: 'e2', source: 'condition_1', target: 'variable_1', sourceHandle: 'true' },
      { id: 'e3', source: 'condition_1', target: 'variable_2', sourceHandle: 'false' },
      { id: 'e4', source: 'variable_1', target: 'log_1' },
      { id: 'e5', source: 'variable_2', target: 'log_1' },
    ],
  };
  const created = await call('POST', '/api/workflows', { token, body: wfBody });
  const wf = created.body.data;
  check('create + reload workflow', created.status === 201 && (await call('GET', `/api/workflows/${wf.id}`, { token })).body.data.edges.length === 5);
  check('webhook URL generated', /\/api\/webhooks\/[a-f0-9]{48}$/.test(wf.webhookUrl));
  const hook = new URL(wf.webhookUrl).pathname;

  console.log('\n[4] Webhook + branches');
  check('inactive workflow refuses webhook', (await call('POST', hook, { body: { email: 'a@acme.com' } })).status === 409);
  check('activate', (await call('PATCH', `/api/workflows/${wf.id}/status`, { token, body: { status: 'active' } })).body.data.status === 'active');
  const t = await call('POST', hook, { body: { email: 'bob@acme.com' } });
  check('webhook TRUE branch succeeds', t.status === 200 && t.body.status === 'success');
  const f = await call('POST', hook, { body: { email: 'eve@gmail.com' } });
  const exT = (await call('GET', `/api/executions/${t.body.executionId}`, { token })).body.data;
  const exF = (await call('GET', `/api/executions/${f.body.executionId}`, { token })).body.data;
  check('TRUE path nodes', exT.nodeResults.map((n) => n.nodeId).join() === 'trigger_1,condition_1,variable_1,log_1');
  check('FALSE path nodes', exF.nodeResults.map((n) => n.nodeId).join() === 'trigger_1,condition_1,variable_2,log_1');
  check('interpolation result stored', exT.logs[0].message === 'bob@acme.com -> internal' && exF.logs[0].message === 'eve@gmail.com -> external');
  check('invalid webhook id -> 404', (await call('POST', `/api/webhooks/${'0'.repeat(48)}`, { body: {} })).status === 404);

  console.log('\n[5] Failure handling + SSRF through the real server');
  const bad = await call('POST', '/api/workflows', { token, body: { name: 'SSRF probe', nodes: [
    { id: 't', type: 'manualTrigger', position: { x: 0, y: 0 }, data: { label: 'T', config: {} } },
    { id: 'h', type: 'httpRequest', position: { x: 200, y: 0 }, data: { label: 'Call', config: { url: '{{trigger.body.target}}', method: 'GET' } } }],
    edges: [{ id: 'e', source: 't', target: 'h' }] } });
  const probe = await call('POST', `/api/workflows/${bad.body.data.id}/execute`, { token, body: { input: { target: 'http://169.254.169.254/latest/meta-data/' } } });
  check('metadata endpoint blocked, execution failed with message', probe.body.data.status === 'failed' && /blocked|not allowed/i.test(probe.body.data.nodeResults[1].error));
  const retry = await call('POST', `/api/executions/${probe.body.data._id}/retry`, { token });
  check('failed execution can be retried (linked)', retry.status === 201 && retry.body.data.retryOf === probe.body.data._id);

  console.log('\n[6] Dashboard reflects real records');
  const stats = (await call('GET', '/api/dashboard/stats', { token })).body.data;
  check('execution counts', stats.executions.total === 4 && stats.executions.success === 2 && stats.executions.failed === 2, JSON.stringify(stats.executions));
  check('workflow counts', stats.workflows.total === 3 && stats.workflows.active === 1);

  console.log('\n[7] Scheduler (real node-cron, every second)');
  const sched = await call('POST', '/api/workflows', { token, body: { name: 'Every second', nodes: [
    { id: 's', type: 'scheduleTrigger', position: { x: 0, y: 0 }, data: { label: 'Tick', config: { mode: 'custom', cron: '* * * * * *' } } },
    { id: 'l', type: 'logMessage', position: { x: 200, y: 0 }, data: { label: 'Log', config: { message: 'tick' } } }],
    edges: [{ id: 'e', source: 's', target: 'l' }] } });
  await call('PATCH', `/api/workflows/${sched.body.data.id}/status`, { token, body: { status: 'active' } });
  await sleep(3500);
  const ticks = (await call('GET', `/api/executions?workflowId=${sched.body.data.id}&triggerType=schedule`, { token })).body;
  check('scheduled workflow executed by itself', ticks.pagination.total >= 2, `ticks=${ticks.pagination.total}`);
  await call('PATCH', `/api/workflows/${sched.body.data.id}/status`, { token, body: { status: 'inactive' } });
  await sleep(300);
  const before = (await call('GET', `/api/executions?workflowId=${sched.body.data.id}`, { token })).body.pagination.total;
  await sleep(2500);
  const after = (await call('GET', `/api/executions?workflowId=${sched.body.data.id}`, { token })).body.pagination.total;
  check('deactivation stops the schedule', after === before, `before=${before} after=${after}`);

  console.log('\n[8] Cross-user isolation');
  const other = await call('POST', '/api/auth/register', { body: { name: 'Other', email: `other_${Date.now()}@example.com`, password: 'Passw0rd!123' } });
  check("other user cannot read the workflow", (await call('GET', `/api/workflows/${wf.id}`, { token: other.body.data.token })).status === 404);
  check("other user cannot read the execution", (await call('GET', `/api/executions/${t.body.executionId}`, { token: other.body.data.token })).status === 404);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
