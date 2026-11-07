const { evaluateCondition: ev } = require('../../services/workflowEngine/conditions');

describe('evaluateCondition', () => {
  test('equals / not_equals (loose string comparison)', () => {
    expect(ev('equals', 5, '5')).toBe(true);
    expect(ev('not_equals', 'a', 'b')).toBe(true);
    expect(ev('equals', undefined, 'x')).toBe(false);
  });
  test('contains / not_contains', () => {
    expect(ev('contains', 'user@Acme.com', 'acme.com')).toBe(true);
    expect(ev('not_contains', 'user@gmail.com', 'acme.com')).toBe(true);
    expect(ev('contains', ['a', 'b'], 'b')).toBe(true);
    expect(ev('contains', undefined, 'x')).toBe(false);
  });
  test('numeric comparisons', () => {
    expect(ev('greater_than', '10', 9)).toBe(true);
    expect(ev('less_than', 3, '4')).toBe(true);
    expect(ev('greater_than', 'abc', 1)).toBe(false);
    expect(ev('less_than', '', 1)).toBe(false);
  });
  test('exists / is_empty', () => {
    expect(ev('exists', 'x')).toBe(true);
    expect(ev('exists', undefined)).toBe(false);
    expect(ev('is_empty', '')).toBe(true);
    expect(ev('is_empty', [])).toBe(true);
    expect(ev('is_empty', 'x')).toBe(false);
  });
  test('rejects unknown operators', () => {
    expect(() => ev('regex', 'a', 'b')).toThrow(/Unsupported operator/);
  });
});
