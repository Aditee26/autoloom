import { describe, expect, test } from 'vitest';
import { validateWorkflow, wouldCreateCycle } from '../utils/validateWorkflow';
import { createNode, nodeSummary, nextNodeId } from '../utils/nodeDefs';

const n = (id, type, config = {}) => ({ id, type, position: { x: 0, y: 0 }, data: { label: id, config } });
const e = (source, target, sourceHandle) => ({ id: `${source}-${target}`, source, target, sourceHandle });

const valid = () => ({
  nodes: [n('t', 'webhookTrigger'), n('c', 'condition', { field: '{{trigger.body.email}}', operator: 'contains', value: '@a.com' }), n('a', 'logMessage', { message: 'x' }), n('b', 'httpRequest', { url: 'https://example.com', method: 'GET' })],
  edges: [e('t', 'c'), e('c', 'a', 'true'), e('c', 'b', 'false')],
});

describe('client workflow validation', () => {
  test('accepts a valid workflow', () => {
    const { nodes, edges } = valid();
    expect(validateWorkflow(nodes, edges)).toMatchObject({ valid: true, errors: [] });
  });
  test('requires exactly one trigger', () => {
    expect(validateWorkflow([], []).valid).toBe(false);
    expect(validateWorkflow([n('a', 'logMessage', { message: 'x' })], []).errors.join()).toMatch(/exactly one trigger/);
    const { nodes, edges } = valid();
    expect(validateWorkflow([...nodes, n('t2', 'manualTrigger')], edges).errors.join()).toMatch(/Only one trigger/);
  });
  test('flags disconnected nodes and attaches errors to the node', () => {
    const { nodes, edges } = valid();
    const r = validateWorkflow([...nodes, n('orphan', 'logMessage', { message: 'x' })], edges);
    expect(r.valid).toBe(false);
    expect(r.nodeErrors.orphan).toContain('Not connected to the trigger');
  });
  test('flags cycles and trigger inputs', () => {
    const { nodes, edges } = valid();
    expect(validateWorkflow(nodes, [...edges, e('a', 'c')]).errors.join()).toMatch(/cycle/);
    expect(validateWorkflow(nodes, [...edges, e('a', 't')]).errors.join()).toMatch(/incoming/);
  });
  test('validates configuration per node type', () => {
    const cases = [
      [n('c', 'condition', { operator: 'equals' }), /Field is required/],
      [n('c', 'condition', { field: 'x', operator: 'equals' }), /value is required/],
      [n('h', 'httpRequest', { url: '' }), /URL is required/],
      [n('h', 'httpRequest', { url: 'ftp://x' }), /http:\/\//],
      [n('h', 'httpRequest', { url: 'https://x.com', body: '{oops' }), /valid JSON/],
      [n('d', 'delay', { seconds: 500 }), /Delay must be/],
      [n('v', 'setVariable', { name: '9x' }), /Variable name/],
      [n('l', 'logMessage', {}), /Message is required/],
      [n('s', 'scheduleTrigger', { mode: 'custom', cron: '' }), /Cron/],
    ];
    for (const [node, re] of cases) {
      const nodes = node.type === 'scheduleTrigger' ? [node, n('l', 'logMessage', { message: 'x' })] : [n('t', 'manualTrigger'), node];
      const edges = node.type === 'scheduleTrigger' ? [e('s', 'l')] : [e('t', node.id)];
      expect(validateWorkflow(nodes, edges).errors.join(' | ')).toMatch(re);
    }
  });
  test('condition needs a connected branch', () => {
    const nodes = [n('t', 'manualTrigger'), n('c', 'condition', { field: 'x', operator: 'exists' })];
    expect(validateWorkflow(nodes, [e('t', 'c')]).nodeErrors.c.join()).toMatch(/TRUE \/ FALSE/);
  });
  test('templated URLs and bodies are accepted statically', () => {
    const nodes = [n('t', 'manualTrigger'), n('h', 'httpRequest', { url: '{{trigger.body.url}}', body: '{"a": {{trigger.body.a}}}' })];
    expect(validateWorkflow(nodes, [e('t', 'h')]).valid).toBe(true);
  });
});

describe('wouldCreateCycle', () => {
  test('detects self, direct and indirect loops', () => {
    const edges = [e('a', 'b'), e('b', 'c')];
    expect(wouldCreateCycle(edges, 'a', 'a')).toBe(true);
    expect(wouldCreateCycle(edges, 'c', 'a')).toBe(true);
    expect(wouldCreateCycle(edges, 'a', 'c')).toBe(false);
  });
});

describe('node definitions', () => {
  test('createNode yields unique ids and labels', () => {
    const first = createNode('httpRequest', { x: 0, y: 0 }, []);
    const second = createNode('httpRequest', { x: 0, y: 0 }, [first]);
    expect(first.id).toBe('http_request_1');
    expect(second.id).toBe('http_request_2');
    expect(second.data.label).toBe('HTTP Request 2');
    expect(nextNodeId('condition', [{ id: 'condition_1' }, { id: 'condition_2' }])).toBe('condition_3');
  });
  test('defaults are cloned, not shared', () => {
    const a = createNode('httpRequest', { x: 0, y: 0 }, []);
    a.data.config.headers.push({ key: 'x', value: 'y' });
    expect(createNode('httpRequest', { x: 0, y: 0 }, []).data.config.headers).toEqual([]);
  });
  test('summaries', () => {
    expect(nodeSummary('scheduleTrigger', { mode: 'daily', hour: 8, minute: 5 })).toBe('Daily at 08:05');
    expect(nodeSummary('scheduleTrigger', { mode: 'weekly', dayOfWeek: 3, hour: 7, minute: 0 })).toBe('Wednesdays at 07:00');
    expect(nodeSummary('condition', { field: 'a', operator: 'exists' })).toBe('a exists');
    expect(nodeSummary('httpRequest', { method: 'POST', url: 'https://x.io' })).toBe('POST https://x.io');
    expect(nodeSummary('httpRequest', {})).toBe('Not configured');
  });
});
