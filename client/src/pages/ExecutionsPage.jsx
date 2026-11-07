import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Activity, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { executionApi, workflowApi } from '../services';
import { errorMessage } from '../services/api';
import { EmptyState, ErrorState, PageHeader, PageLoader, StatusBadge, useDebounced } from '../components/common/ui';
import { formatDateTime, formatDuration, triggerLabel } from '../utils/format';

export default function ExecutionsPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') || '');
  const [workflows, setWorkflows] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const debounced = useDebounced(search);
  const status = params.get('status') || '';
  const workflowId = params.get('workflowId') || '';
  const page = Number(params.get('page') || 1);

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  useEffect(() => { workflowApi.list({}).then((r) => setWorkflows(r.data)).catch(() => {}); }, []);

  const load = useCallback(async () => {
    setError('');
    try { setResult(await executionApi.list({ status: status || undefined, workflowId: workflowId || undefined, search: debounced || undefined, page, limit: 15 })); }
    catch (err) { setError(errorMessage(err, 'Could not load executions')); }
  }, [status, workflowId, debounced, page]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="fade-in">
      <PageHeader title="Executions" description="Every run of every workflow, with full per-node detail." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input pl-8" placeholder="Search workflow name or execution ID" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search executions" />
        </div>
        <select className="input w-auto max-w-[220px]" value={workflowId} onChange={(e) => setParam('workflowId', e.target.value)} aria-label="Filter by workflow">
          <option value="">All workflows</option>{workflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <select className="input w-auto" value={status} onChange={(e) => setParam('status', e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>{['success', 'failed', 'running', 'pending', 'cancelled'].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
        </select>
      </div>

      {error ? <ErrorState message={error} onRetry={load} /> : !result ? <PageLoader /> : result.data.length === 0 ? (
        <div className="card"><EmptyState icon={Activity} title="No executions found" description={status || workflowId || search ? 'No executions match these filters.' : 'Executions appear here when a workflow runs.'} /></div>
      ) : (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead className="border-b border-line"><tr><th className="th">Workflow</th><th className="th">Execution ID</th><th className="th">Status</th><th className="th">Trigger</th><th className="th">Started</th><th className="th">Completed</th><th className="th">Duration</th></tr></thead>
              <tbody className="divide-y divide-line">
                {result.data.map((e) => (
                  <tr key={e._id} className="hover:bg-subtle/60">
                    <td className="td"><Link className="font-medium hover:underline" to={`/executions/${e._id}`}>{e.workflowName}</Link></td>
                    <td className="td font-mono text-xs text-muted">{e._id}</td>
                    <td className="td"><StatusBadge status={e.status} /></td>
                    <td className="td text-muted">{triggerLabel[e.triggerType]}</td>
                    <td className="td text-muted">{formatDateTime(e.startedAt)}</td>
                    <td className="td text-muted">{formatDateTime(e.completedAt)}</td>
                    <td className="td tabular-nums">{formatDuration(e.duration)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted">
            <span>{result.pagination.total} execution{result.pagination.total === 1 ? '' : 's'}</span>
            <div className="flex items-center gap-2">
              <button className="btn btn-sm" disabled={page <= 1} onClick={() => setParam('page', String(page - 1))} aria-label="Previous page"><ChevronLeft size={14} /></button>
              <span>Page {result.pagination.page} of {result.pagination.pages}</span>
              <button className="btn btn-sm" disabled={page >= result.pagination.pages} onClick={() => setParam('page', String(page + 1))} aria-label="Next page"><ChevronRight size={14} /></button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
