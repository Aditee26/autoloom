import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Copy, MoreHorizontal, Pencil, Plus, Power, PowerOff, Search, Trash2, Workflow } from 'lucide-react';
import { workflowApi } from '../services';
import { errorMessage } from '../services/api';
import { useToast } from '../context/ToastContext';
import { ConfirmDialog, EmptyState, ErrorState, Field, Modal, PageHeader, PageLoader, Spinner, StatusBadge, useDebounced } from '../components/common/ui';
import { timeAgo, triggerLabel } from '../utils/format';
import { createNode } from '../utils/nodeDefs';

function RowMenu({ wf, onDuplicate, onToggle, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const act = (fn) => () => { setOpen(false); fn(); };
  return (
    <div className="relative" ref={ref}>
      <button className="btn btn-ghost btn-sm px-1.5" onClick={() => setOpen(!open)} aria-label={`Actions for ${wf.name}`} aria-expanded={open}><MoreHorizontal size={16} /></button>
      {open && (
        <div className="card fade-in absolute right-0 z-30 mt-1 w-44 p-1 shadow-pop">
          <Link className="menu-item" to={`/workflows/${wf.id}`}><Pencil size={14} />Edit</Link>
          <button className="menu-item" onClick={act(onDuplicate)}><Copy size={14} />Duplicate</button>
          {wf.triggerType !== 'manual' && (
            <button className="menu-item" onClick={act(onToggle)}>{wf.status === 'active' ? <><PowerOff size={14} />Deactivate</> : <><Power size={14} />Activate</>}</button>
          )}
          <button className="menu-item text-bad" onClick={act(onDelete)}><Trash2 size={14} />Delete</button>
        </div>
      )}
    </div>
  );
}

export function CreateWorkflowModal({ open, onClose }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const start = createNode('manualTrigger', { x: 80, y: 160 }, []);
      const res = await workflowApi.create({ name: name.trim(), description: description.trim(), nodes: [start], edges: [] });
      navigate(`/workflows/${res.data.id}`);
    } catch (err) { toast.error(errorMessage(err, 'Could not create the workflow')); setBusy(false); }
  };

  return (
    <Modal open={open} onClose={busy ? undefined : onClose} title="New workflow"
      footer={<><button className="btn" onClick={onClose} disabled={busy}>Cancel</button><button className="btn btn-primary" form="create-wf" disabled={busy || !name.trim()}>{busy && <Spinner size={14} className="text-current" />}Create & open editor</button></>}>
      <form id="create-wf" onSubmit={submit} className="space-y-4">
        <Field label="Name" htmlFor="wf-name"><input id="wf-name" className="input" autoFocus maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New customer onboarding" /></Field>
        <Field label="Description (optional)" htmlFor="wf-desc"><textarea id="wf-desc" className="input min-h-[72px]" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      </form>
    </Modal>
  );
}

export default function WorkflowsPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') || '');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('updated');
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(params.get('new') === '1');
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const debounced = useDebounced(search);

  useEffect(() => { setSearch(params.get('search') || ''); }, [params]);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await workflowApi.list({ search: debounced || undefined, status: status || undefined, sort });
      setItems(res.data);
    } catch (err) { setError(errorMessage(err, 'Could not load workflows')); }
  }, [debounced, status, sort]);
  useEffect(() => { load(); }, [load]);

  const duplicate = async (wf) => {
    try { await workflowApi.duplicate(wf.id); toast.success('Workflow duplicated'); load(); }
    catch (err) { toast.error(errorMessage(err)); }
  };
  const toggle = async (wf) => {
    const next = wf.status === 'active' ? 'inactive' : 'active';
    try { await workflowApi.setStatus(wf.id, next); toast.success(next === 'active' ? 'Workflow activated' : 'Workflow deactivated'); load(); }
    catch (err) {
      const details = err.response?.data?.details;
      toast.error(Array.isArray(details) && details.length ? `${errorMessage(err)}: ${details[0]}` : errorMessage(err));
    }
  };
  const confirmDelete = async () => {
    setDeleting(true);
    try { await workflowApi.remove(toDelete.id); toast.success('Workflow deleted'); setToDelete(null); load(); }
    catch (err) { toast.error(errorMessage(err)); }
    finally { setDeleting(false); }
  };

  const closeCreate = () => { setCreating(false); if (params.get('new')) { params.delete('new'); setParams(params, { replace: true }); } };

  return (
    <div className="fade-in">
      <PageHeader title="Workflows" description="Build, activate and manage your automations."
        actions={<button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={14} />New workflow</button>} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input pl-8" placeholder="Search by name or description" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search workflows" />
        </div>
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
        </select>
        <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort workflows">
          <option value="updated">Recently updated</option><option value="created">Newest</option><option value="name">Name (A–Z)</option>
        </select>
      </div>

      {error ? <ErrorState message={error} onRetry={load} /> : !items ? <PageLoader /> : items.length === 0 ? (
        <div className="card">
          {search || status ? <EmptyState icon={Search} title="No workflows match" description="Try a different search or clear the filters." />
            : <EmptyState icon={Workflow} title="No workflows yet" description="Create a workflow or start from a template." action={<button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={14} />New workflow</button>} />}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-line"><tr><th className="th">Name</th><th className="th">Status</th><th className="th">Trigger</th><th className="th">Runs</th><th className="th">Last run</th><th className="th">Updated</th><th className="th" /></tr></thead>
            <tbody className="divide-y divide-line">
              {items.map((wf) => (
                <tr key={wf.id} className="hover:bg-subtle/60">
                  <td className="td"><Link to={`/workflows/${wf.id}`} className="font-medium hover:underline">{wf.name}</Link><p className="max-w-xs truncate text-xs text-muted">{wf.description || 'No description'}</p></td>
                  <td className="td"><StatusBadge status={wf.status} /></td>
                  <td className="td text-muted">{triggerLabel[wf.triggerType]}</td>
                  <td className="td tabular-nums">{wf.totalExecutions}</td>
                  <td className="td text-muted">{timeAgo(wf.lastExecutedAt)}</td>
                  <td className="td text-muted">{timeAgo(wf.updatedAt)}</td>
                  <td className="td text-right"><RowMenu wf={wf} onDuplicate={() => duplicate(wf)} onToggle={() => toggle(wf)} onDelete={() => setToDelete(wf)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateWorkflowModal open={creating} onClose={closeCreate} />
      <ConfirmDialog open={Boolean(toDelete)} danger busy={deleting} title="Delete workflow" confirmLabel="Delete workflow"
        message={`“${toDelete?.name}” will be permanently deleted and its webhook URL and schedule will stop working. Past executions stay in your history.`}
        onConfirm={confirmDelete} onCancel={() => setToDelete(null)} />
    </div>
  );
}
