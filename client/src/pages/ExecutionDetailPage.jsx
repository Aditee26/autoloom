import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, CircleSlash, GitBranch, Loader2, RotateCcw, XCircle } from 'lucide-react';
import { executionApi } from '../services';
import { errorMessage } from '../services/api';
import { useToast } from '../context/ToastContext';
import { Collapsible, ErrorState, JsonView, PageLoader, Spinner, StatusBadge } from '../components/common/ui';
import { formatDateTime, formatDuration, triggerLabel } from '../utils/format';
import { NODE_DEFS } from '../utils/nodeDefs';

const ICON = { success: CheckCircle2, failed: XCircle, running: Loader2, skipped: CircleSlash };
const TONE = { success: 'text-ok border-ok/40 bg-ok/10', failed: 'text-bad border-bad/40 bg-bad/10', running: 'text-accent border-accent/40 bg-accent/10', skipped: 'text-muted border-line bg-subtle' };

export function NodeTimeline({ results }) {
  return (
    <ol className="relative space-y-4">
      {results.map((r, i) => {
        const Icon = ICON[r.status] || CircleSlash;
        const TypeIcon = NODE_DEFS[r.nodeType]?.icon || GitBranch;
        const last = i === results.length - 1;
        return (
          <li key={`${r.nodeId}-${i}`} className="relative flex gap-4">
            {!last && <span className="absolute left-[15px] top-8 h-[calc(100%-8px)] w-px bg-line" aria-hidden="true" />}
            <span className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${TONE[r.status] || TONE.skipped}`}><Icon size={16} className={r.status === 'running' ? 'animate-spin' : ''} /></span>
            <div className={`card min-w-0 flex-1 p-4 ${r.status === 'failed' ? 'border-bad/40' : ''}`}>
              <div className="flex flex-wrap items-center gap-2">
                <TypeIcon size={14} className="text-muted" />
                <h3 className="font-medium">{r.label}</h3>
                <span className="font-mono text-xs text-muted">{r.nodeId}</span>
                <span className="ml-auto flex items-center gap-3 text-xs text-muted"><StatusBadge status={r.status} /><span className="tabular-nums">{formatDuration(r.duration)}</span></span>
              </div>
              <p className="mt-1 text-xs text-muted">{formatDateTime(r.startedAt)} → {formatDateTime(r.completedAt)}{r.branch && <> · took the <b className="text-fg">{r.branch.toUpperCase()}</b> branch</>}</p>
              {r.error && <p role="alert" className="mt-3 rounded-md border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{r.error}</p>}
              <div className="mt-3 space-y-2">
                <Collapsible title="Input"><JsonView value={r.input} /></Collapsible>
                <Collapsible title="Output" defaultOpen={r.status === 'failed'}><JsonView value={r.output} /></Collapsible>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function ExecutionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [exec, setExec] = useState(null);
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try { setExec((await executionApi.get(id)).data); } catch (err) { setError(errorMessage(err, 'Could not load the execution')); }
  }, [id]);
  useEffect(() => { setExec(null); load(); }, [load]);

  // Poll while an execution is still in flight.
  useEffect(() => {
    if (!exec || !['running', 'pending'].includes(exec.status)) return undefined;
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [exec, load]);

  const retry = async () => {
    setRetrying(true);
    try { const res = await executionApi.retry(id); toast.success('Retry started'); navigate(`/executions/${res.data._id}`); }
    catch (err) { toast.error(errorMessage(err, 'Retry failed')); }
    finally { setRetrying(false); }
  };

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!exec) return <PageLoader />;
  const canRetry = ['failed', 'cancelled'].includes(exec.status);

  return (
    <div className="fade-in">
      <Link to="/executions" className="mb-4 inline-flex items-center gap-1 text-xs text-muted hover:text-fg"><ArrowLeft size={12} />All executions</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3"><h1 className="text-xl font-semibold tracking-tight">{exec.workflowName}</h1><StatusBadge status={exec.status} /></div>
          <p className="mt-1 font-mono text-xs text-muted">{exec._id}</p>
        </div>
        <div className="flex gap-2">
          <Link className="btn" to={`/workflows/${exec.workflowId}`}>Open workflow</Link>
          {canRetry && <button className="btn btn-primary" onClick={retry} disabled={retrying}>{retrying ? <Spinner size={14} className="text-current" /> : <RotateCcw size={14} />}Retry</button>}
        </div>
      </div>

      <div className="card mb-6 grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
        {[['Trigger', triggerLabel[exec.triggerType]], ['Started', formatDateTime(exec.startedAt)], ['Completed', formatDateTime(exec.completedAt)], ['Duration', formatDuration(exec.duration)]].map(([k, v]) => (
          <div key={k}><p className="text-xs text-muted">{k}</p><p className="mt-0.5 font-medium">{v}</p></div>
        ))}
      </div>

      {exec.error?.message && <p role="alert" className="mb-6 rounded-md border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad"><b>Execution failed.</b> {exec.error.message}</p>}
      {exec.retryOf && <p className="mb-6 text-sm text-muted">Retry of <Link className="text-accent hover:underline" to={`/executions/${exec.retryOf}`}>{exec.retryOf}</Link></p>}

      <h2 className="mb-3 text-sm font-semibold">Execution timeline</h2>
      {exec.nodeResults.length === 0 ? <p className="text-sm text-muted">{['running', 'pending'].includes(exec.status) ? 'Waiting for the first node…' : 'No nodes were executed.'}</p> : <NodeTimeline results={exec.nodeResults} />}

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <div className="card p-4"><h3 className="mb-2 text-sm font-semibold">Trigger input</h3><JsonView value={exec.executionContext?.trigger ?? exec.input} /></div>
        <div className="card p-4"><h3 className="mb-2 text-sm font-semibold">Variables & logs</h3><JsonView value={{ variables: exec.executionContext?.variables || {}, logs: exec.logs || [] }} /></div>
      </div>
    </div>
  );
}
