const { node, edge } = require('../helpers');

const branching = () => ({
  name: 'Registration handler',
  nodes: [
    node('trigger', 'webhookTrigger', {}, 'Webhook'),
    node('check', 'condition', { field: '{{trigger.body.email}}', operator: 'contains', value: '@acme.com' }, 'Check'),
    node('yes', 'setVariable', { name: 'route', value: 'internal' }, 'Yes'),
    node('no', 'setVariable', { name: 'route', value: 'external' }, 'No'),
    node('done', 'logMessage', { message: 'route={{variables.route}} email={{trigger.body.email}}' }, 'Done'),
  ],
  edges: [edge('trigger', 'check'), edge('check', 'yes', 'true'), edge('check', 'no', 'false'), edge('yes', 'done'), edge('no', 'done')],
});
const manual = (extra = []) => ({
  name: 'Manual flow',
  nodes: [node('t', 'manualTrigger'), node('log', 'logMessage', { message: 'hello {{trigger.body.name}}' }), ...extra],
  edges: [edge('t', 'log')],
});
module.exports = { branching, manual };
