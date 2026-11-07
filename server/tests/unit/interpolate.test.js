const { interpolate, resolvePath } = require('../../services/workflowEngine/interpolate');

const ctx = {
  trigger: { body: { email: 'a@acme.com', items: [{ id: 7 }], n: 5 } },
  nodes: { http_1: { status: 200 } },
  variables: { customerName: 'Ada' },
  execution: { id: 'e1' },
};

describe('interpolate', () => {
  test('substitutes trigger, node and variable paths', () => {
    expect(interpolate('Hi {{variables.customerName}} <{{trigger.body.email}}> {{nodes.http_1.status}}', ctx))
      .toBe('Hi Ada <a@acme.com> 200');
  });
  test('whole-value template keeps original type', () => {
    expect(interpolate('{{trigger.body.n}}', ctx)).toBe(5);
    expect(interpolate('{{trigger.body.items[0].id}}', ctx)).toBe(7);
  });
  test('missing paths become empty string', () => {
    expect(interpolate('x{{trigger.body.nope}}y', ctx)).toBe('xy');
  });
  test('recurses into objects and arrays', () => {
    expect(interpolate({ a: ['{{variables.customerName}}'], b: { c: '{{execution.id}}' } }, ctx))
      .toEqual({ a: ['Ada'], b: { c: 'e1' } });
  });
  test('does not execute code and blocks prototype access', () => {
    expect(interpolate('{{trigger.constructor.name}}', ctx)).toBe('');
    expect(interpolate('{{trigger.__proto__}}', ctx)).toBe('');
    expect(interpolate('{{process.env.JWT_SECRET}}', ctx)).toBe('');
    expect(interpolate('{{ (() => 1)() }}', ctx)).toBe('');
    expect(resolvePath(ctx, 'userId')).toBeUndefined();
  });
});
