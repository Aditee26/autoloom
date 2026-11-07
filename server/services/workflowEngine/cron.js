const cron = require('node-cron');

/** Convert schedule trigger config into a cron expression. Throws on invalid input. */
function buildCronExpression(config = {}) {
  const mode = config.mode || 'daily';
  const int = (v, def, min, max, label) => {
    const n = v === undefined || v === '' ? def : Number(v);
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${label} must be an integer between ${min} and ${max}`);
    return n;
  };
  let expr;
  if (mode === 'hourly') {
    expr = `${int(config.minute, 0, 0, 59, 'Minute')} * * * *`;
  } else if (mode === 'daily') {
    expr = `${int(config.minute, 0, 0, 59, 'Minute')} ${int(config.hour, 9, 0, 23, 'Hour')} * * *`;
  } else if (mode === 'weekly') {
    expr = `${int(config.minute, 0, 0, 59, 'Minute')} ${int(config.hour, 9, 0, 23, 'Hour')} * * ${int(config.dayOfWeek, 1, 0, 6, 'Day of week')}`;
  } else if (mode === 'custom') {
    expr = String(config.cron || '').trim();
    if (!expr) throw new Error('Cron expression is required');
  } else {
    throw new Error(`Unsupported schedule mode: ${mode}`);
  }
  if (!cron.validate(expr)) throw new Error(`Invalid cron expression: ${expr}`);
  return expr;
}

module.exports = { buildCronExpression };
