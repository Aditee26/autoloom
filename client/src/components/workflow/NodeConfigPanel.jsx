import { Copy, Trash2, X } from 'lucide-react';
import { CopyButton, Field } from '../common/ui';
import KeyValueEditor from './KeyValueEditor';
import { HTTP_METHODS, MAX_DELAY_SECONDS, NODE_DEFS, NO_VALUE_OPERATORS, OPERATORS, isTrigger } from '../../utils/nodeDefs';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const num = (v) => (v === '' ? '' : Number(v));

function VariableHelp({ upstream }) {
  return (
    <details className="rounded-md border border-line bg-subtle/60 p-2.5 text-xs text-muted">
      <summary className="cursor-pointer font-medium text-fg">Using data from earlier steps</summary>
      <div className="mt-2 space-y-1.5">
        <p>Reference values in any text field with <code className="font-mono">{'{{ }}'}</code>:</p>
        <ul className="space-y-0.5 font-mono">
          <li>{'{{trigger.body.email}}'}</li>
          <li>{'{{variables.customerName}}'}</li>
          <li>{'{{nodes.http_request_1.status}}'}</li>
        </ul>
        {upstream.length > 0 && <p>Earlier nodes you can reference: {upstream.map((u) => <code key={u} className="mr-1 font-mono text-fg">{u}</code>)}</p>}
        <p>Values are substituted as plain data; no code is ever executed.</p>
      </div>
    </details>
  );
}

function TriggerExtras({ node, config, set, webhookUrl }) {
  if (node.type === 'webhookTrigger') {
    const curl = `curl -X POST "${webhookUrl || '<save the workflow to get a URL>'}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"email":"jane@example.com"}'`;
    return (
      <div className="space-y-3">
        <Field label="Webhook URL" hint="Unique to this workflow. Only active workflows accept requests.">
          {webhookUrl ? (
            <div className="flex gap-1.5"><input readOnly className="input font-mono text-xs" value={webhookUrl} aria-label="Webhook URL" onFocus={(e) => e.target.select()} /><CopyButton text={webhookUrl} /></div>
          ) : <p className="rounded-md border border-line bg-subtle px-3 py-2 text-xs text-muted">The URL is generated the first time this workflow is saved.</p>}
        </Field>
        <details className="text-xs text-muted"><summary className="cursor-pointer font-medium text-fg">Example request</summary><pre className="mt-2 overflow-auto rounded-md border border-line bg-subtle p-2 font-mono">{curl}</pre></details>
        <p className="text-xs text-muted">Captured for later nodes: <code className="font-mono">trigger.body</code>, <code className="font-mono">trigger.headers</code>, <code className="font-mono">trigger.method</code>, <code className="font-mono">trigger.query</code>, <code className="font-mono">trigger.timestamp</code>.</p>
      </div>
    );
  }
  if (node.type === 'scheduleTrigger') {
    return (
      <div className="space-y-3">
        <Field label="Frequency" htmlFor="sch-mode">
          <select id="sch-mode" className="input" value={config.mode || 'daily'} onChange={(e) => set({ mode: e.target.value })}>
            <option value="hourly">Hourly</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="custom">Custom cron</option>
          </select>
        </Field>
        {config.mode === 'weekly' && <Field label="Day of week" htmlFor="sch-dow"><select id="sch-dow" className="input" value={config.dayOfWeek ?? 1} onChange={(e) => set({ dayOfWeek: Number(e.target.value) })}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></Field>}
        {['daily', 'weekly'].includes(config.mode || 'daily') && <Field label="Hour (0–23, server time)" htmlFor="sch-hour"><input id="sch-hour" className="input" type="number" min={0} max={23} value={config.hour ?? 9} onChange={(e) => set({ hour: num(e.target.value) })} /></Field>}
        {config.mode !== 'custom' && <Field label="Minute (0–59)" htmlFor="sch-min"><input id="sch-min" className="input" type="number" min={0} max={59} value={config.minute ?? 0} onChange={(e) => set({ minute: num(e.target.value) })} /></Field>}
        {config.mode === 'custom' && <Field label="Cron expression" htmlFor="sch-cron" hint="5 fields (minute hour day month weekday); a 6th leading seconds field is supported."><input id="sch-cron" className="input font-mono" placeholder="*/15 * * * *" value={config.cron || ''} onChange={(e) => set({ cron: e.target.value })} /></Field>}
        <p className="text-xs text-muted">The schedule only runs while the workflow is <b>active</b>.</p>
      </div>
    );
  }
  return <p className="text-xs text-muted">Runs when you click <b>Test workflow</b>. Manual workflows run on demand and are not activated.</p>;
}

export default function NodeConfigPanel({ node, upstream, integrations, webhookUrl, errors = [], onLabel, onConfig, onDelete, onDuplicate, onClose }) {
  const def = NODE_DEFS[node.type];
  const config = node.data.config || {};
  const set = (patch) => onConfig({ ...config, ...patch });
  const Icon = def.icon;

  return (
    <div className="flex h-full flex-col" data-testid="config-panel">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2"><Icon size={15} className="text-muted" /><h2 className="text-sm font-semibold">{def.title}</h2></div>
        <button className="text-muted hover:text-fg" onClick={onClose} aria-label="Close panel"><X size={16} /></button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {errors.length > 0 && <ul role="alert" className="space-y-1 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">{errors.map((e) => <li key={e}>• {e}</li>)}</ul>}

        <Field label="Name" htmlFor="node-label"><input id="node-label" className="input" maxLength={80} value={node.data.label || ''} onChange={(e) => onLabel(e.target.value)} /></Field>
        <Field label="Node ID" hint="Use this to reference the node's output, e.g. nodes.<id>.status">
          <div className="flex gap-1.5"><input readOnly className="input font-mono text-xs" value={node.id} aria-label="Node ID" /><CopyButton text={node.id} /></div>
        </Field>

        <hr className="border-line" />

        {isTrigger(node.type) && <TriggerExtras node={node} config={config} set={set} webhookUrl={webhookUrl} />}

        {node.type === 'condition' && (
          <div className="space-y-3">
            <Field label="Field" htmlFor="c-field" hint="A value to test, usually a reference."><input id="c-field" className="input font-mono text-xs" placeholder="{{trigger.body.email}}" value={config.field || ''} onChange={(e) => set({ field: e.target.value })} /></Field>
            <Field label="Operator" htmlFor="c-op"><select id="c-op" className="input" value={config.operator || 'equals'} onChange={(e) => set({ operator: e.target.value })}>{OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>
            {!NO_VALUE_OPERATORS.includes(config.operator) && <Field label="Comparison value" htmlFor="c-val"><input id="c-val" className="input" value={config.value ?? ''} onChange={(e) => set({ value: e.target.value })} /></Field>}
            <p className="text-xs text-muted">Connect the <b className="text-ok">TRUE</b> and <b className="text-bad">FALSE</b> outputs to different nodes. Only the matching branch runs.</p>
          </div>
        )}

        {node.type === 'httpRequest' && (
          <div className="space-y-3">
            <Field label="Saved integration (optional)" htmlFor="h-int" hint="Reuses the endpoint and credentials stored under Integrations.">
              <select id="h-int" className="input" value={config.integrationId || ''} onChange={(e) => set({ integrationId: e.target.value || undefined })}>
                <option value="">None, configure manually</option>
                {integrations.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1"><Field label="Method" htmlFor="h-method"><select id="h-method" className="input" value={config.method || 'GET'} onChange={(e) => set({ method: e.target.value })}>{HTTP_METHODS.map((m) => <option key={m}>{m}</option>)}</select></Field></div>
              <div className="col-span-2"><Field label={config.integrationId ? 'URL (override)' : 'URL'} htmlFor="h-url"><input id="h-url" className="input font-mono text-xs" placeholder="https://api.example.com/path" value={config.url || ''} onChange={(e) => set({ url: e.target.value })} /></Field></div>
            </div>
            <KeyValueEditor label="Headers" items={config.headers || []} onChange={(headers) => set({ headers })} keyPlaceholder="Header" />
            <KeyValueEditor label="Query parameters" items={config.queryParams || []} onChange={(queryParams) => set({ queryParams })} keyPlaceholder="Parameter" />
            <Field label="JSON body" htmlFor="h-body" hint={['GET', 'DELETE'].includes(config.method || 'GET') ? 'Not sent for GET and DELETE requests.' : undefined}>
              <textarea id="h-body" className="input min-h-[96px] font-mono text-xs" spellCheck={false} placeholder={'{\n  "email": "{{trigger.body.email}}"\n}'} value={config.body || ''} onChange={(e) => set({ body: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Timeout (ms)" htmlFor="h-to"><input id="h-to" className="input" type="number" min={100} max={30000} value={config.timeoutMs ?? 10000} onChange={(e) => set({ timeoutMs: num(e.target.value) })} /></Field>
              <Field label="Retries (0–3)" htmlFor="h-re"><input id="h-re" className="input" type="number" min={0} max={3} value={config.retries ?? 0} onChange={(e) => set({ retries: num(e.target.value) })} /></Field>
            </div>
            <label className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" checked={config.failOnHttpError !== false} onChange={(e) => set({ failOnHttpError: e.target.checked })} /><span>Fail the workflow on non-2xx responses<span className="block text-muted">Turn off to branch on <code className="font-mono">status</code> with a Condition node.</span></span></label>
            <p className="text-xs text-muted">Only public destinations are allowed. Localhost, private networks and cloud metadata addresses are blocked.</p>
          </div>
        )}

        {node.type === 'delay' && <Field label={`Delay (seconds, max ${MAX_DELAY_SECONDS})`} htmlFor="d-sec"><input id="d-sec" className="input" type="number" min={0} max={MAX_DELAY_SECONDS} step="0.5" value={config.seconds ?? 1} onChange={(e) => set({ seconds: num(e.target.value) })} /></Field>}

        {node.type === 'setVariable' && (
          <div className="space-y-3">
            <Field label="Variable name" htmlFor="v-name" hint="Referenced as {{variables.name}}"><input id="v-name" className="input font-mono text-xs" value={config.name || ''} onChange={(e) => set({ name: e.target.value })} placeholder="customerName" /></Field>
            <Field label="Type" htmlFor="v-type"><select id="v-type" className="input" value={config.valueType || 'string'} onChange={(e) => set({ valueType: e.target.value })}><option value="string">Text</option><option value="number">Number</option><option value="boolean">Boolean</option><option value="json">JSON</option></select></Field>
            <Field label="Value" htmlFor="v-val"><textarea id="v-val" className="input min-h-[72px] font-mono text-xs" value={config.value ?? ''} onChange={(e) => set({ value: e.target.value })} placeholder="{{trigger.body.name}}" /></Field>
          </div>
        )}

        {node.type === 'logMessage' && (
          <div className="space-y-3">
            <Field label="Level" htmlFor="l-lvl"><select id="l-lvl" className="input" value={config.level || 'info'} onChange={(e) => set({ level: e.target.value })}><option value="info">Info</option><option value="warn">Warning</option><option value="error">Error</option></select></Field>
            <Field label="Message" htmlFor="l-msg"><textarea id="l-msg" className="input min-h-[72px]" value={config.message || ''} onChange={(e) => set({ message: e.target.value })} placeholder="Customer {{trigger.body.email}} registered" /></Field>
          </div>
        )}

        {!isTrigger(node.type) && <VariableHelp upstream={upstream} />}
      </div>

      <div className="flex gap-2 border-t border-line px-4 py-3">
        {!isTrigger(node.type) && <button className="btn flex-1" onClick={onDuplicate}><Copy size={14} />Duplicate</button>}
        <button className="btn flex-1 text-bad" onClick={onDelete}><Trash2 size={14} />Delete</button>
      </div>
    </div>
  );
}
