// Real HTTP round trip against a local server. ALLOW_PRIVATE_HTTP is only honoured when NODE_ENV=test.
process.env.ALLOW_PRIVATE_HTTP = 'true';
const http = require('http');
const { runGraph } = require('../../services/workflowEngine/runner');
const { node, edge } = require('../helpers');

let server; let base; const hits = [];
beforeAll(() => new Promise((resolve) => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      hits.push({ method: req.method, url: req.url, body, auth: req.headers.authorization, ct: req.headers['content-type'] });
      if (req.url.startsWith('/slow')) return setTimeout(() => res.end('late'), 1500);
      if (req.url.startsWith('/redirect')) { res.writeHead(302, { Location: 'http://169.254.169.254/' }); return res.end(); }
      if (req.url.startsWith('/fail')) { res.writeHead(404); return res.end('nope'); }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, echo: body ? JSON.parse(body) : null }));
    });
  }).listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; resolve(); });
}));
afterAll(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()); }));

const wf = (cfg) => ({ nodes: [node('t', 'manualTrigger'), node('h', 'httpRequest', cfg)], edges: [edge('t', 'h')] });

describe('HTTP node over a real socket', () => {
  test('POST with JSON body, headers and query params', async () => {
    const r = await runGraph({ workflow: wf({ url: `${base}/echo`, method: 'POST', body: '{"a":"{{trigger.body.v}}"}', headers: [{ key: 'Authorization', value: 'Bearer t0k' }], queryParams: [{ key: 'x', value: '1' }] }), userId: 'u', triggerInput: { body: { v: 'hello' } } });
    expect(r.status).toBe('success');
    const out = r.nodeResults[1].output;
    expect(out.status).toBe(200);
    expect(out.body.echo).toEqual({ a: 'hello' });
    const hit = hits.at(-1);
    expect(hit.url).toBe('/echo?x=1');
    expect(hit.auth).toBe('Bearer t0k');
    expect(hit.ct).toMatch(/application\/json/);
  });
  test('non-2xx fails the node but keeps status and body', async () => {
    const r = await runGraph({ workflow: wf({ url: `${base}/fail` }), userId: 'u', triggerInput: {} });
    expect(r.status).toBe('failed');
    expect(r.nodeResults[1].output.status).toBe(404);
  });
  test('failOnHttpError=false lets workflow continue', async () => {
    const r = await runGraph({ workflow: wf({ url: `${base}/fail`, failOnHttpError: false }), userId: 'u', triggerInput: {} });
    expect(r.status).toBe('success');
  });
  test('timeout is enforced', async () => {
    const r = await runGraph({ workflow: wf({ url: `${base}/slow`, timeoutMs: 300 }), userId: 'u', triggerInput: {} });
    expect(r.status).toBe('failed');
    expect(r.nodeResults[1].error).toMatch(/timed out/);
  });
  test('redirects are not followed', async () => {
    const r = await runGraph({ workflow: wf({ url: `${base}/redirect`, failOnHttpError: false }), userId: 'u', triggerInput: {} });
    expect(r.nodeResults[1].output.status).toBe(302);
    expect(hits.some((h) => h.url === '/')).toBe(false);
  });
});
