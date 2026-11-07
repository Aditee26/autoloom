const { buildCronExpression } = require('../../services/workflowEngine/cron');

describe('buildCronExpression', () => {
  test('hourly / daily / weekly / custom', () => {
    expect(buildCronExpression({ mode: 'hourly', minute: 15 })).toBe('15 * * * *');
    expect(buildCronExpression({ mode: 'daily', hour: 8, minute: 30 })).toBe('30 8 * * *');
    expect(buildCronExpression({ mode: 'weekly', dayOfWeek: 3, hour: 7, minute: 0 })).toBe('0 7 * * 3');
    expect(buildCronExpression({ mode: 'custom', cron: '*/5 * * * *' })).toBe('*/5 * * * *');
  });
  test('rejects invalid input', () => {
    expect(() => buildCronExpression({ mode: 'daily', hour: 25 })).toThrow(/Hour/);
    expect(() => buildCronExpression({ mode: 'custom', cron: '' })).toThrow(/required/);
    expect(() => buildCronExpression({ mode: 'custom', cron: 'nope' })).toThrow(/Invalid cron/);
    expect(() => buildCronExpression({ mode: 'yearly' })).toThrow(/Unsupported/);
  });
});
