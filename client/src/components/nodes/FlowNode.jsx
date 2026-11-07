import '@xyflow/react/dist/style.css';
import { Handle, Position } from '@xyflow/react';
import { AlertTriangle, CheckCircle2, CircleSlash, Loader2, XCircle } from 'lucide-react';
import { NODE_DEFS, nodeSummary } from '../../utils/nodeDefs';

const KIND_STYLE = {
  trigger: { bar: 'bg-accent', tint: 'bg-accent/10 text-accent', label: 'Trigger' },
  condition: { bar: 'bg-warn', tint: 'bg-warn/10 text-warn', label: 'Condition' },
  action: { bar: 'bg-muted', tint: 'bg-subtle text-fg', label: 'Action' },
};
const STATUS = {
  running: { icon: Loader2, cls: 'text-accent', spin: true, text: 'Running' },
  success: { icon: CheckCircle2, cls: 'text-ok', text: 'Success' },
  failed: { icon: XCircle, cls: 'text-bad', text: 'Failed' },
  skipped: { icon: CircleSlash, cls: 'text-muted', text: 'Skipped' },
};

export default function FlowNode({ type, data, selected }) {
  const def = NODE_DEFS[type];
  if (!def) return <div className="card px-3 py-2 text-xs text-bad">Unknown node: {type}</div>;
  const style = KIND_STYLE[def.kind];
  const Icon = def.icon;
  const st = data.status ? STATUS[data.status] : null;
  const hasErrors = data.errors && data.errors.length > 0;
  const ring = data.status === 'failed' ? 'border-bad' : data.status === 'success' ? 'border-ok/60' : selected ? 'border-accent ring-2 ring-accent/30' : hasErrors ? 'border-warn/70' : 'border-line';

  return (
    <div className={`relative w-[230px] overflow-hidden rounded-lg border bg-surface shadow-card transition-colors ${ring}`} data-testid={`node-${data.nodeId || type}`}>
      <span className={`absolute inset-y-0 left-0 w-1 ${style.bar}`} aria-hidden="true" />
      <div className="flex items-start gap-2.5 py-2.5 pl-4 pr-3">
        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${style.tint}`}><Icon size={15} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[13px] font-semibold leading-tight">{data.label || def.title}</p>
            {hasErrors && <span title={data.errors.join('\n')}><AlertTriangle size={12} className="shrink-0 text-warn" aria-label="Has configuration issues" /></span>}
          </div>
          <p className="mt-0.5 line-clamp-2 break-words text-xs text-muted">{nodeSummary(type, data.config)}</p>
          <div className="mt-1.5 flex items-center justify-between text-[10px] uppercase tracking-wide text-muted">
            <span>{style.label}</span>
            {st && <span className={`flex items-center gap-1 normal-case ${st.cls}`}><st.icon size={11} className={st.spin ? 'animate-spin' : ''} />{st.text}</span>}
          </div>
        </div>
      </div>

      {def.kind !== 'trigger' && <Handle type="target" position={Position.Left} />}
      {def.kind === 'condition' ? (
        <>
          <Handle type="source" position={Position.Right} id="true" style={{ top: '35%', background: 'rgb(var(--ok))' }} />
          <Handle type="source" position={Position.Right} id="false" style={{ top: '70%', background: 'rgb(var(--bad))' }} />
          <span className="pointer-events-none absolute right-3 top-[35%] -translate-y-1/2 text-[9px] font-bold text-ok">TRUE</span>
          <span className="pointer-events-none absolute right-3 top-[70%] -translate-y-1/2 text-[9px] font-bold text-bad">FALSE</span>
        </>
      ) : (
        <Handle type="source" position={Position.Right} />
      )}
    </div>
  );
}

export const nodeTypes = Object.fromEntries(Object.keys(NODE_DEFS).map((t) => [t, FlowNode]));
