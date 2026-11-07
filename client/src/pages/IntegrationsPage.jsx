import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Pencil, Plug, Plus, Trash2, Webhook } from 'lucide-react';
import { integrationApi, workflowApi } from '../services';
import { errorMessage } from '../services/api';
import { useToast } from '../context/ToastContext';
import { ConfirmDialog, CopyButton, EmptyState, ErrorState, Field, Modal, PageHeader, PageLoader, Spinner, StatusBadge } from '../components/common/ui';
import { timeAgo } from '../utils/format';
import { HTTP_METHODS } from '../utils/nodeDefs';

const AUTH_LABEL = { none: 'No authentication', bearer: 'Bearer token', apiKey: 'API key header' };
const blank = { name: '', url: '', method: 'POST', authType: 'none', apiKeyHeader: 'X-API-Key', secret: '', headers: [] };

function IntegrationModal({ open, initial, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const editing = Boolean(initial?.id);

  useEffect(() => {
    if (!open) return;
    setForm(initial ? { name: initial.name, url: initial.configuration.url, method: initial.configuration.method || 'POST', authType: initial.configuration.authType || 'none', apiKeyHeader: initial.configuration.apiKeyHeader || 'X-API-Key', secret: '', headers: initial.configuration.headers || [] } : blank);
  }, [open, initial]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setHeader = (i, k, v) => set('headers', form.headers.map((h, idx) => (idx === i ? { ...h, [k]: v } : h)));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const body = {
      name: form.name.trim(), type: 'http',
      configuration: { url: form.url.trim(), method: form.method, authType: form.authType, apiKeyHeader: form.apiKeyHeader, headers: form.headers.filter((h) => h.key?.trim()) },
      ...(form.secret ? { secret: form.secret } : {}),
    };
    try {
      if (editing) await integrationApi.update(initial.id, body); else await integrationApi.create(body);
      toast.success(editing ? 'Integration updated' : 'Integration created');
      onSaved();
    } catch (err) { toast.error(errorMessage(err, 'Could not save the integration')); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={busy ? undefined : onClose} title={editing ? 'Edit integration' : 'New HTTP integration'}
      footer={<><button className="btn" onClick={onClose} disabled={busy}>Cancel</button><button className="btn btn-primary" form="integration-form" disabled={busy || !form.name.trim() || !form.url.trim()}>{busy && <Spinner size={14} className="text-current" />}Save</button></>}>
      <form id="integration-form" onSubmit={submit} className="space-y-4">
        <Field label="Name" htmlFor="i-name"><input id="i-name" className="input" maxLength={80} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Billing API" /></Field>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-1"><Field label="Method" htmlFor="i-method"><select id="i-method" className="input" value={form.method} onChange={(e) => set('method', e.target.value)}>{HTTP_METHODS.map((m) => <option key={m}>{m}</option>)}</select></Field></div>
          <div className="col-span-2"><Field label="Endpoint URL" htmlFor="i-url"><input id="i-url" className="input" value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="https://api.example.com/v1/events" /></Field></div>
        </div>
        <Field label="Authentication" htmlFor="i-auth"><select id="i-auth" className="input" value={form.authType} onChange={(e) => set('authType', e.target.value)}>{Object.entries(AUTH_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        {form.authType === 'apiKey' && <Field label="Header name" htmlFor="i-hdr"><input id="i-hdr" className="input" value={form.apiKeyHeader} onChange={(e) => set('apiKeyHeader', e.target.value)} /></Field>}
        {form.authType !== 'none' && (
          <Field label={form.authType === 'bearer' ? 'Token' : 'API key'} htmlFor="i-secret" hint={editing && initial.hasSecret ? 'A secret is stored. Leave blank to keep it.' : 'Encrypted before it is stored and never shown again.'}>
            <input id="i-secret" className="input" type="password" autoComplete="off" value={form.secret} onChange={(e) => set('secret', e.target.value)} placeholder={editing && initial.hasSecret ? '••••••••' : ''} />
          </Field>
        )}
        <div>
          <div className="mb-1 flex items-center justify-between"><span className="label mb-0">Default headers</span><button type="button" className="btn btn-sm" onClick={() => set('headers', [...form.headers, { key: '', value: '' }])}><Plus size={12} />Add</button></div>
          {form.headers.map((h, i) => (
            <div key={i} className="mb-1.5 flex gap-1.5">
              <input className="input" placeholder="Header" aria-label={`Header name ${i + 1}`} value={h.key} onChange={(e) => setHeader(i, 'key', e.target.value)} />
              <input className="input" placeholder="Value" aria-label={`Header value ${i + 1}`} value={h.value} onChange={(e) => setHeader(i, 'value', e.target.value)} />
              <button type="button" className="btn btn-ghost px-2" aria-label="Remove header" onClick={() => set('headers', form.headers.filter((_, idx) => idx !== i))}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </form>
    </Modal>
  );
}

export default function IntegrationsPage() {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [webhooks, setWebhooks] = useState([]);
  const [error, setError] = useState('');
  const [modal, setModal] = useState({ open: false, initial: null });
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [i, w] = await Promise.all([integrationApi.list(), workflowApi.list({})]);
      setItems(i.data); setWebhooks(w.data.filter((x) => x.triggerType === 'webhook'));
    } catch (err) { setError(errorMessage(err, 'Could not load integrations')); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const remove = async () => {
    setDeleting(true);
    try { await integrationApi.remove(toDelete.id); toast.success('Integration deleted'); setToDelete(null); load(); }
    catch (err) { toast.error(errorMessage(err)); } finally { setDeleting(false); }
  };

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!items) return <PageLoader />;

  return (
    <div className="fade-in space-y-10">
      <section>
        <PageHeader title="Integrations" description="Reusable HTTP configurations. Pick one from an HTTP Request node to reuse its endpoint and credentials."
          actions={<button className="btn btn-primary" onClick={() => setModal({ open: true, initial: null })}><Plus size={14} />New integration</button>} />
        {items.length === 0 ? (
          <div className="card"><EmptyState icon={Plug} title="No integrations yet" description="Save an endpoint and its credentials once, then reuse it across workflows. Secrets are encrypted at rest." action={<button className="btn btn-primary" onClick={() => setModal({ open: true, initial: null })}><Plus size={14} />New integration</button>} /></div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="border-b border-line"><tr><th className="th">Name</th><th className="th">Endpoint</th><th className="th">Method</th><th className="th">Authentication</th><th className="th">Last used</th><th className="th" /></tr></thead>
              <tbody className="divide-y divide-line">
                {items.map((i) => (
                  <tr key={i.id} className="hover:bg-subtle/60">
                    <td className="td font-medium">{i.name}</td>
                    <td className="td max-w-[260px] truncate font-mono text-xs text-muted" title={i.configuration.url}>{i.configuration.url}</td>
                    <td className="td"><span className="badge border-line bg-subtle">{i.configuration.method}</span></td>
                    <td className="td text-muted"><span className="inline-flex items-center gap-1">{i.hasSecret && <KeyRound size={12} />}{AUTH_LABEL[i.configuration.authType]}</span></td>
                    <td className="td text-muted">{timeAgo(i.lastUsedAt)}</td>
                    <td className="td text-right"><div className="flex justify-end gap-1">
                      <button className="btn btn-ghost btn-sm" onClick={() => setModal({ open: true, initial: i })} aria-label={`Edit ${i.name}`}><Pencil size={14} /></button>
                      <button className="btn btn-ghost btn-sm text-bad" onClick={() => setToDelete(i)} aria-label={`Delete ${i.name}`}><Trash2 size={14} /></button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-1 flex items-center gap-2 text-base font-semibold"><Webhook size={16} />Webhook endpoints</h2>
        <p className="mb-4 text-sm text-muted">Each workflow with a Webhook Trigger has its own unguessable URL. Send an HTTP POST with a JSON body to start it. The workflow must be active.</p>
        {webhooks.length === 0 ? <div className="card"><EmptyState title="No webhook workflows" description="Add a Webhook Trigger node to a workflow to get an endpoint." /></div> : (
          <div className="card divide-y divide-line">
            {webhooks.map((w) => {
              const url = w.webhookUrl;
              return (
                <div key={w.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Link to={`/workflows/${w.id}`} className="font-medium hover:underline">{w.name}</Link>
                    <p className="truncate font-mono text-xs text-muted">{w.webhookUrl}</p>
                  </div>
                  <StatusBadge status={w.status} />
                  <CopyButton text={w.webhookUrl || url} label="Copy URL" />
                </div>
              );
            })}
          </div>
        )}
      </section>

      <IntegrationModal open={modal.open} initial={modal.initial} onClose={() => setModal({ open: false, initial: null })} onSaved={() => { setModal({ open: false, initial: null }); load(); }} />
      <ConfirmDialog open={Boolean(toDelete)} danger busy={deleting} title="Delete integration" confirmLabel="Delete" message={`Delete “${toDelete?.name}”? HTTP Request nodes that use it will fail until you pick another.`} onConfirm={remove} onCancel={() => setToDelete(null)} />
    </div>
  );
}
