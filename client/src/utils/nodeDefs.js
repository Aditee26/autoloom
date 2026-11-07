import { Play, Webhook, Clock, GitBranch, Globe, Timer, Variable, ScrollText } from 'lucide-react';

export const OPERATORS = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'not_contains', label: 'Does not contain' },
  { value: 'greater_than', label: 'Greater than' },
  { value: 'less_than', label: 'Less than' },
  { value: 'exists', label: 'Exists' },
  { value: 'is_empty', label: 'Is empty' },
];
export const NO_VALUE_OPERATORS = ['exists', 'is_empty'];
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
export const MAX_DELAY_SECONDS = 30;

export const NODE_DEFS = {
  manualTrigger: { type: 'manualTrigger', kind: 'trigger', category: 'Triggers', title: 'Manual Trigger', description: 'Run on demand with a test payload', icon: Play, prefix: 'trigger', defaults: {} },
  webhookTrigger: { type: 'webhookTrigger', kind: 'trigger', category: 'Triggers', title: 'Webhook Trigger', description: 'Start when a POST hits the workflow URL', icon: Webhook, prefix: 'trigger', defaults: {} },
  scheduleTrigger: { type: 'scheduleTrigger', kind: 'trigger', category: 'Triggers', title: 'Schedule Trigger', description: 'Run hourly, daily, weekly or by cron', icon: Clock, prefix: 'trigger', defaults: { mode: 'daily', hour: 9, minute: 0, dayOfWeek: 1, cron: '0 9 * * *' } },
  condition: { type: 'condition', kind: 'condition', category: 'Logic', title: 'Condition', description: 'Branch on TRUE or FALSE', icon: GitBranch, prefix: 'condition', defaults: { field: '', operator: 'equals', value: '' } },
  httpRequest: { type: 'httpRequest', kind: 'action', category: 'Actions', title: 'HTTP Request', description: 'Call any public HTTP API', icon: Globe, prefix: 'http_request', defaults: { method: 'GET', url: '', headers: [], queryParams: [], body: '', timeoutMs: 10000, retries: 0, failOnHttpError: true } },
  delay: { type: 'delay', kind: 'action', category: 'Actions', title: 'Delay', description: 'Wait a few seconds', icon: Timer, prefix: 'delay', defaults: { seconds: 1 } },
  setVariable: { type: 'setVariable', kind: 'action', category: 'Actions', title: 'Set Variable', description: 'Store a value for later nodes', icon: Variable, prefix: 'variable', defaults: { name: '', value: '', valueType: 'string' } },
  logMessage: { type: 'logMessage', kind: 'action', category: 'Actions', title: 'Log Message', description: 'Write a message to the run log', icon: ScrollText, prefix: 'log', defaults: { level: 'info', message: '' } },
};

export const TRIGGER_TYPES = ['manualTrigger', 'webhookTrigger', 'scheduleTrigger'];
export const CATEGORY_ORDER = ['Triggers', 'Logic', 'Actions'];
export const isTrigger = (type) => TRIGGER_TYPES.includes(type);

export function libraryByCategory() {
  return CATEGORY_ORDER.map((category) => ({ category, items: Object.values(NODE_DEFS).filter((d) => d.category === category) }));
}

export function nextNodeId(type, nodes) {
  const prefix = NODE_DEFS[type].prefix;
  let n = 1;
  const taken = new Set(nodes.map((x) => x.id));
  while (taken.has(`${prefix}_${n}`)) n += 1;
  return `${prefix}_${n}`;
}

export function createNode(type, position, nodes) {
  const def = NODE_DEFS[type];
  const id = nextNodeId(type, nodes);
  const sameType = nodes.filter((n) => n.type === type).length + 1;
  return { id, type, position, data: { label: sameType > 1 ? `${def.title} ${sameType}` : def.title, config: JSON.parse(JSON.stringify(def.defaults)) } };
}

const CRON_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pad = (n) => String(n ?? 0).padStart(2, '0');

export function nodeSummary(type, c = {}) {
  switch (type) {
    case 'manualTrigger': return 'Runs when you click Test';
    case 'webhookTrigger': return 'POST to the workflow URL';
    case 'scheduleTrigger':
      if (c.mode === 'hourly') return `Hourly at :${pad(c.minute)}`;
      if (c.mode === 'weekly') return `${CRON_DAYS[c.dayOfWeek ?? 1]}s at ${pad(c.hour)}:${pad(c.minute)}`;
      if (c.mode === 'custom') return `cron ${c.cron || '…'}`;
      return `Daily at ${pad(c.hour)}:${pad(c.minute)}`;
    case 'condition': {
      const op = OPERATORS.find((o) => o.value === c.operator)?.label.toLowerCase() || c.operator;
      if (!c.field) return 'Not configured';
      return NO_VALUE_OPERATORS.includes(c.operator) ? `${c.field} ${op}` : `${c.field} ${op} ${c.value ?? ''}`;
    }
    case 'httpRequest': return c.url ? `${c.method || 'GET'} ${c.url}` : 'Not configured';
    case 'delay': return `Wait ${c.seconds ?? 0}s`;
    case 'setVariable': return c.name ? `${c.name} = ${c.value ?? ''}` : 'Not configured';
    case 'logMessage': return c.message || 'Not configured';
    default: return '';
  }
}
