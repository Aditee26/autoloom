const { runGraph } = require('../../services/workflowEngine/runner');
const { node, edge } = require('../helpers');

const okHttp = (calls) => async (req) => {
  calls.push(req);
  return { status: 200, statusText: 'OK', headers: { 'content-type': 'application/json' }, data: { received: true } };
};

const branching = () => ({
  _id: 'wf1',
  nodes: [
    node('trigger', 'webhookTrigger'),
    node('check', 'condition', { field: '{{trigger.body.email}}', operator: 'contains', value: '@acme.com' }),
    node('notify', 'httpRequest', { url: 'https://8.8.8.8/hook', method: 'POST', body: '{"email":"{{trigger.body.email}}","n":"{{trigger.body.n}}"}', headers: [{ key: 'Authorization', value: 'Bearer abc' }] }),
    node('fallback', 'setVariable', { name: 'route', value: 'manual-review' }),
    node('done', 'logMessage', { message: 'route={{variables.route}} status={{nodes.notify.status}}' }),
  ],
  edges: [edge('trigger', 'check'), edge('check', 'notify', 'true'), edge('check', 'fallback', 'false'), edge('notify', 'done'), edge('fallback', 'done')],
});

describe('runGraph', () => {
  test('TRUE branch runs HTTP node, skips FALSE branch, interpolates', async () => {
    const calls = [];
    const r = await runGraph({ workflow: branching(), userId: 'u1', triggerInput: { body: { email: 'bob@acme.com', n: 3 }, headers: { authorization: 'secret' } }, deps: { httpClient: okHttp(calls), triggerKind: 'webhook' } });
    expect(r.status).toBe('success');
    expect(r.nodeResults.map((n) => n.nodeId)).toEqual(['trigger', 'check', 'notify', 'done']);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].data).toEqual({ email: 'bob@acme.com', n: 3 });
    expect(r.nodeResults[1].branch).toBe('true');
    expect(r.nodeResults[2].input.headers.Authorization).toBe('********'); // masked in history
    expect(r.logs[0].message).toBe('route= status=200');
    expect(r.nodeResults[0].output.headers.authorization).toBe('********');
  });

  test('FALSE branch runs fallback and skips HTTP', async () => {
    const calls = [];
    const r = await runGraph({ workflow: branching(), userId: 'u1', triggerInput: { body: { email: 'bob@gmail.com' } }, deps: { httpClient: okHttp(calls), triggerKind: 'webhook' } });
    expect(r.status).toBe('success');
    expect(calls).toHaveLength(0);
    expect(r.nodeResults.map((n) => n.nodeId)).toEqual(['trigger', 'check', 'fallback', 'done']);
    expect(r.variables.route).toBe('manual-review');
    expect(r.logs[0].message).toBe('route=manual-review status=');
  });

  test('failed node stops execution and records the error', async () => {
    const failing = async () => ({ status: 500, statusText: 'Server Error', headers: {}, data: 'boom' });
    const r = await runGraph({ workflow: branching(), userId: 'u1', triggerInput: { body: { email: 'x@acme.com' } }, deps: { httpClient: failing, retryDelayMs: 0, triggerKind: 'webhook' } });
    expect(r.status).toBe('failed');
    expect(r.error.nodeId).toBe('notify');
    expect(r.error.message).toMatch(/HTTP 500/);
    expect(r.nodeResults.at(-1).status).toBe('failed');
    expect(r.nodeResults.find((n) => n.nodeId === 'done')).toBeUndefined();
  });

  test('retries 5xx up to configured count then succeeds', async () => {
    let n = 0;
    const flaky = async () => (++n < 3 ? { status: 503, statusText: 'x', headers: {}, data: '' } : { status: 200, statusText: 'OK', headers: {}, data: 'ok' });
    const w = { nodes: [node('t', 'manualTrigger'), node('h', 'httpRequest', { url: 'https://8.8.8.8', retries: 3 })], edges: [edge('t', 'h')] };
    const r = await runGraph({ workflow: w, userId: 'u', triggerInput: {}, deps: { httpClient: flaky, retryDelayMs: 0 } });
    expect(r.status).toBe('success');
    expect(r.nodeResults[1].output.attempts).toBe(3);
  });

  test('network errors are retried, then reported', async () => {
    let n = 0;
    const down = async () => { n += 1; const e = new Error('ECONNRESET'); throw e; };
    const w = { nodes: [node('t', 'manualTrigger'), node('h', 'httpRequest', { url: 'https://8.8.8.8', retries: 1 })], edges: [edge('t', 'h')] };
    const r = await runGraph({ workflow: w, userId: 'u', triggerInput: {}, deps: { httpClient: down, retryDelayMs: 0 } });
    expect(n).toBe(2);
    expect(r.status).toBe('failed');
    expect(r.nodeResults[1].error).toMatch(/Request failed: ECONNRESET/);
  });

  test('SSRF: HTTP node refuses private destinations at run time (templated URL)', async () => {
    const calls = [];
    const w = { nodes: [node('t', 'webhookTrigger'), node('h', 'httpRequest', { url: '{{trigger.body.target}}' })], edges: [edge('t', 'h')] };
    for (const target of ['http://169.254.169.254/latest', 'http://127.0.0.1:3000', 'file:///etc/passwd']) {
      const r = await runGraph({ workflow: w, userId: 'u', triggerInput: { body: { target } }, deps: { httpClient: okHttp(calls), triggerKind: 'webhook' } });
      expect(r.status).toBe('failed');
    }
    expect(calls).toHaveLength(0);
  });

  test('set variable with typed values feeds later conditions', async () => {
    const w = {
      nodes: [node('t', 'manualTrigger'), node('v', 'setVariable', { name: 'score', value: '{{trigger.body.score}}', valueType: 'number' }),
        node('c', 'condition', { field: 'variables.score', operator: 'greater_than', value: 50 }), node('hi', 'logMessage', { message: 'high' }), node('lo', 'logMessage', { message: 'low' })],
      edges: [edge('t', 'v'), edge('v', 'c'), edge('c', 'hi', 'true'), edge('c', 'lo', 'false')],
    };
    const r = await runGraph({ workflow: w, userId: 'u', triggerInput: { body: { score: '72' } } });
    expect(r.variables.score).toBe(72);
    expect(r.logs.map((l) => l.message)).toEqual(['high']);
  });

  test('delay uses injected sleep and is bounded by validation', async () => {
    const waits = [];
    const w = { nodes: [node('t', 'manualTrigger'), node('d', 'delay', { seconds: 2 })], edges: [edge('t', 'd')] };
    const r = await runGraph({ workflow: w, userId: 'u', triggerInput: {}, deps: { sleep: async (ms) => waits.push(ms) } });
    expect(r.status).toBe('success');
    expect(waits).toEqual([2000]);
    const bad = { nodes: [node('t', 'manualTrigger'), node('d', 'delay', { seconds: 9999 })], edges: [edge('t', 'd')] };
    const rb = await runGraph({ workflow: bad, userId: 'u', triggerInput: {} });
    expect(rb.status).toBe('failed');
    expect(rb.error.message).toMatch(/validation failed/);
  });

  test('invalid workflow fails without executing anything', async () => {
    const r = await runGraph({ workflow: { nodes: [node('a', 'logMessage', { message: 'x' })], edges: [] }, userId: 'u', triggerInput: {} });
    expect(r.status).toBe('failed');
    expect(r.nodeResults).toHaveLength(0);
  });

  test('diamond merge executes the shared node once', async () => {
    const w = { nodes: [node('t', 'manualTrigger'), node('a', 'logMessage', { message: 'a' }), node('b', 'logMessage', { message: 'b' }), node('m', 'logMessage', { message: 'merge' })],
      edges: [edge('t', 'a'), edge('t', 'b'), edge('a', 'm'), edge('b', 'm')] };
    const r = await runGraph({ workflow: w, userId: 'u', triggerInput: {} });
    expect(r.nodeResults.filter((n) => n.nodeId === 'm')).toHaveLength(1);
  });

  test('cancellation is honoured between nodes', async () => {
    let calls = 0;
    const w = { nodes: [node('t', 'manualTrigger'), node('a', 'logMessage', { message: 'a' })], edges: [edge('t', 'a')] };
    const r = await runGraph({ workflow: w, userId: 'u', triggerInput: {}, shouldCancel: async () => ++calls > 1 });
    expect(r.status).toBe('cancelled');
    expect(r.nodeResults.map((n) => n.nodeId)).toEqual(['t']);
  });

  test('onNodeResult callback receives each node result', async () => {
    const seen = [];
    const w = { nodes: [node('t', 'manualTrigger'), node('a', 'logMessage', { message: 'a' })], edges: [edge('t', 'a')] };
    await runGraph({ workflow: w, userId: 'u', triggerInput: {}, onNodeResult: async (n) => seen.push(n.nodeId) });
    expect(seen).toEqual(['t', 'a']);
  });
});
