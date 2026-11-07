const { validateWorkflow } = require('../../services/workflowEngine/validator');
const { node, edge } = require('../helpers');

const good = () => ({
  nodes: [
    node('t', 'webhookTrigger'),
    node('c', 'condition', { field: '{{trigger.body.email}}', operator: 'contains', value: '@acme.com' }),
    node('a', 'logMessage', { message: 'yes' }),
    node('b', 'logMessage', { message: 'no' }),
  ],
  edges: [edge('t', 'c'), edge('c', 'a', 'true'), edge('c', 'b', 'false')],
});

describe('validateWorkflow', () => {
  test('accepts a valid branching workflow', () => {
    const r = validateWorkflow(good());
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
    expect(r.triggerNode.id).toBe('t');
  });
  test('rejects empty workflow', () => expect(validateWorkflow({ nodes: [], edges: [] }).valid).toBe(false));
  test('requires exactly one trigger', () => {
    const none = validateWorkflow({ nodes: [node('a', 'logMessage', { message: 'x' })], edges: [] });
    expect(none.errors.join()).toMatch(/exactly one trigger/);
    const w = good();
    w.nodes.push(node('t2', 'manualTrigger'));
    expect(validateWorkflow(w).errors.join()).toMatch(/found 2/);
  });
  test('detects disconnected nodes', () => {
    const w = good();
    w.nodes.push(node('x', 'logMessage', { message: 'orphan' }));
    expect(validateWorkflow(w).errors.join()).toMatch(/not connected to the trigger/);
  });
  test('rejects cycles', () => {
    const w = good();
    w.edges.push(edge('a', 'c'));
    expect(validateWorkflow(w).errors.join()).toMatch(/cycle/);
  });
  test('rejects edges to missing nodes and incoming trigger edges', () => {
    const w = good();
    w.edges.push(edge('a', 'ghost'));
    expect(validateWorkflow(w).errors.join()).toMatch(/missing node/);
    const w2 = good();
    w2.edges.push(edge('a', 't'));
    expect(validateWorkflow(w2).errors.join()).toMatch(/incoming/);
  });
  test('condition branches must use true/false handles', () => {
    const w = good();
    w.edges[1] = edge('c', 'a');
    expect(validateWorkflow(w).errors.join()).toMatch(/TRUE or FALSE/);
  });
  test('trigger must have an outgoing connection', () => {
    expect(validateWorkflow({ nodes: [node('t', 'manualTrigger')], edges: [] }).errors.join()).toMatch(/at least one node/);
  });
  test('validates node configuration', () => {
    const cases = [
      ['condition', { operator: 'equals', value: 'x' }, /field is required/],
      ['condition', { field: 'a', operator: 'bogus' }, /operator/],
      ['condition', { field: 'a', operator: 'equals' }, /comparison value/],
      ['httpRequest', { method: 'GET' }, /URL is required/],
      ['httpRequest', { url: 'http://localhost/x' }, /not allowed/],
      ['httpRequest', { url: 'ftp://example.com' }, /protocol/],
      ['httpRequest', { url: 'https://example.com', method: 'TRACE' }, /unsupported method/],
      ['httpRequest', { url: 'https://example.com', body: '{bad' }, /valid JSON/],
      ['httpRequest', { url: 'https://example.com', retries: 9 }, /retries/],
      ['delay', { seconds: 999 }, /delay must be/],
      ['setVariable', { name: '1bad' }, /variable name/],
      ['logMessage', {}, /message is required/],
    ];
    for (const [type, cfg, re] of cases) {
      const w = { nodes: [node('t', 'manualTrigger'), node('n', type, cfg)], edges: [edge('t', 'n')] };
      expect(validateWorkflow(w).errors.join(' | ')).toMatch(re);
    }
  });
  test('schedule trigger config is validated', () => {
    const w = { nodes: [node('t', 'scheduleTrigger', { mode: 'custom', cron: 'not cron' }), node('l', 'logMessage', { message: 'x' })], edges: [edge('t', 'l')] };
    expect(validateWorkflow(w).errors.join()).toMatch(/Invalid cron/);
  });
});
