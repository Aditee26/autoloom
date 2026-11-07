const n = (id, type, label, x, y, config = {}) => ({ id, type, position: { x, y }, data: { label, config } });
const e = (source, target, sourceHandle) => ({ id: `e_${source}_${target}${sourceHandle ? `_${sourceHandle}` : ''}`, source, target, ...(sourceHandle ? { sourceHandle } : {}) });

module.exports = [
  {
    slug: 'webhook-to-http-notification',
    name: 'Webhook to HTTP Notification',
    description: 'Receive a webhook and forward the payload to another HTTP endpoint.',
    category: 'Webhooks',
    nodes: [
      n('trigger_1', 'webhookTrigger', 'Incoming Webhook', 0, 100),
      n('http_request_1', 'httpRequest', 'Send Notification', 300, 100, { method: 'POST', url: 'https://example.com/notify', headers: [], queryParams: [], body: '{"event":"webhook_received","payload":"{{trigger.body}}"}', timeoutMs: 10000, retries: 1, failOnHttpError: true }),
      n('log_1', 'logMessage', 'Log Result', 600, 100, { level: 'info', message: 'Notification sent, status {{nodes.http_request_1.status}}' }),
    ],
    edges: [e('trigger_1', 'http_request_1'), e('http_request_1', 'log_1')],
  },
  {
    slug: 'customer-registration-handler',
    name: 'Customer Registration Handler',
    description: 'Check the new customer\'s email domain and route company users differently from everyone else.',
    category: 'Customers',
    nodes: [
      n('trigger_1', 'webhookTrigger', 'New Registration', 0, 150),
      n('condition_1', 'condition', 'Company email?', 300, 150, { field: '{{trigger.body.email}}', operator: 'contains', value: '@yourcompany.com' }),
      n('http_request_1', 'httpRequest', 'Notify Internal App', 620, 40, { method: 'POST', url: 'https://example.com/internal/new-employee', body: '{"email":"{{trigger.body.email}}","name":"{{trigger.body.name}}"}', timeoutMs: 10000, retries: 1, failOnHttpError: true }),
      n('variable_1', 'setVariable', 'Mark For Review', 620, 260, { name: 'route', value: 'manual-review', valueType: 'string' }),
      n('log_1', 'logMessage', 'Log Review', 920, 260, { level: 'info', message: 'Customer {{trigger.body.email}} routed to {{variables.route}}' }),
    ],
    edges: [e('trigger_1', 'condition_1'), e('condition_1', 'http_request_1', 'true'), e('condition_1', 'variable_1', 'false'), e('variable_1', 'log_1')],
  },
  {
    slug: 'conditional-email-routing',
    name: 'Conditional Email Routing',
    description: 'Route incoming messages to an urgent or standard endpoint based on their priority field.',
    category: 'Routing',
    nodes: [
      n('trigger_1', 'webhookTrigger', 'Incoming Message', 0, 150),
      n('condition_1', 'condition', 'Is urgent?', 300, 150, { field: '{{trigger.body.priority}}', operator: 'equals', value: 'high' }),
      n('http_request_1', 'httpRequest', 'Urgent Mailbox', 620, 40, { method: 'POST', url: 'https://example.com/mail/urgent', body: '{"subject":"{{trigger.body.subject}}","from":"{{trigger.body.from}}"}', timeoutMs: 10000, retries: 0, failOnHttpError: true }),
      n('http_request_2', 'httpRequest', 'Standard Mailbox', 620, 260, { method: 'POST', url: 'https://example.com/mail/standard', body: '{"subject":"{{trigger.body.subject}}","from":"{{trigger.body.from}}"}', timeoutMs: 10000, retries: 0, failOnHttpError: true }),
    ],
    edges: [e('trigger_1', 'condition_1'), e('condition_1', 'http_request_1', 'true'), e('condition_1', 'http_request_2', 'false')],
  },
  {
    slug: 'scheduled-api-health-check',
    name: 'Scheduled API Health Check',
    description: 'Ping an API every hour and log whether it is healthy.',
    category: 'Monitoring',
    nodes: [
      n('trigger_1', 'scheduleTrigger', 'Every Hour', 0, 150, { mode: 'hourly', minute: 0 }),
      n('http_request_1', 'httpRequest', 'Check API', 300, 150, { method: 'GET', url: 'https://example.com/health', timeoutMs: 8000, retries: 1, failOnHttpError: false }),
      n('condition_1', 'condition', 'Status is 200?', 600, 150, { field: '{{nodes.http_request_1.status}}', operator: 'equals', value: '200' }),
      n('log_1', 'logMessage', 'Healthy', 900, 40, { level: 'info', message: 'API healthy ({{nodes.http_request_1.durationMs}} ms)' }),
      n('log_2', 'logMessage', 'Unhealthy', 900, 260, { level: 'error', message: 'API returned status {{nodes.http_request_1.status}}' }),
    ],
    edges: [e('trigger_1', 'http_request_1'), e('http_request_1', 'condition_1'), e('condition_1', 'log_1', 'true'), e('condition_1', 'log_2', 'false')],
  },
  {
    slug: 'data-validation-workflow',
    name: 'Data Validation Workflow',
    description: 'Validate that a payload has an email and an adult age before accepting it.',
    category: 'Data',
    nodes: [
      n('trigger_1', 'webhookTrigger', 'Submission', 0, 200),
      n('condition_1', 'condition', 'Email present?', 300, 200, { field: '{{trigger.body.email}}', operator: 'exists' }),
      n('condition_2', 'condition', 'Age over 17?', 620, 100, { field: '{{trigger.body.age}}', operator: 'greater_than', value: '17' }),
      n('log_1', 'logMessage', 'Accepted', 940, 20, { level: 'info', message: 'Valid submission from {{trigger.body.email}}' }),
      n('log_2', 'logMessage', 'Rejected: Age', 940, 200, { level: 'warn', message: 'Rejected {{trigger.body.email}}: age requirement not met' }),
      n('log_3', 'logMessage', 'Rejected: Email', 620, 340, { level: 'warn', message: 'Rejected submission: email is missing' }),
    ],
    edges: [e('trigger_1', 'condition_1'), e('condition_1', 'condition_2', 'true'), e('condition_1', 'log_3', 'false'), e('condition_2', 'log_1', 'true'), e('condition_2', 'log_2', 'false')],
  },
  {
    slug: 'simple-http-request-automation',
    name: 'Simple HTTP Request Automation',
    description: 'Run on demand: call an API, store the status in a variable and log it.',
    category: 'Basics',
    nodes: [
      n('trigger_1', 'manualTrigger', 'Run Manually', 0, 100),
      n('http_request_1', 'httpRequest', 'Fetch Data', 300, 100, { method: 'GET', url: 'https://example.com/api/data', queryParams: [{ key: 'source', value: 'autoloom' }], timeoutMs: 10000, retries: 1, failOnHttpError: true }),
      n('variable_1', 'setVariable', 'Save Status', 600, 100, { name: 'lastStatus', value: '{{nodes.http_request_1.status}}', valueType: 'number' }),
      n('log_1', 'logMessage', 'Log Status', 900, 100, { level: 'info', message: 'Fetched data with status {{variables.lastStatus}}' }),
    ],
    edges: [e('trigger_1', 'http_request_1'), e('http_request_1', 'variable_1'), e('variable_1', 'log_1')],
  },
];
