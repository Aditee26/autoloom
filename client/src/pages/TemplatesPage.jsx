import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Eye, LayoutTemplate } from 'lucide-react';
import { templateApi } from '../services';
import { errorMessage } from '../services/api';
import { useToast } from '../context/ToastContext';
import { EmptyState, ErrorState, Modal, PageHeader, PageLoader, Spinner } from '../components/common/ui';
import TemplatePreview from '../components/workflow/TemplatePreview';
import { NODE_DEFS } from '../utils/nodeDefs';

export default function TemplatesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [templates, setTemplates] = useState(null);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('All');
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [cloning, setCloning] = useState('');

  useEffect(() => { templateApi.list().then((r) => setTemplates(r.data)).catch((e) => setError(errorMessage(e, 'Could not load templates'))); }, []);
  const categories = useMemo(() => ['All', ...new Set((templates || []).map((t) => t.category))], [templates]);

  const openPreview = async (t) => {
    setPreviewLoading(true); setPreview({ ...t, nodes: null });
    try { setPreview((await templateApi.get(t._id)).data); } catch (e) { toast.error(errorMessage(e)); setPreview(null); }
    finally { setPreviewLoading(false); }
  };
  const clone = async (t) => {
    setCloning(t._id);
    try { const res = await templateApi.clone(t._id); toast.success('Template cloned into your workflows'); navigate(`/workflows/${res.data.id}`); }
    catch (e) { toast.error(errorMessage(e, 'Could not clone the template')); setCloning(''); }
  };

  if (error) return <ErrorState message={error} />;
  if (!templates) return <PageLoader />;
  const shown = category === 'All' ? templates : templates.filter((t) => t.category === category);

  return (
    <div className="fade-in">
      <PageHeader title="Templates" description="Start from a working workflow and edit it to fit." />
      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Template categories">
        {categories.map((c) => <button key={c} role="tab" aria-selected={category === c} onClick={() => setCategory(c)} className={`btn btn-sm ${category === c ? 'btn-primary' : ''}`}>{c}</button>)}
      </div>
      {shown.length === 0 ? <div className="card"><EmptyState icon={LayoutTemplate} title="No templates" /></div> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((t) => (
            <article key={t._id} className="card flex flex-col p-4">
              <span className="badge mb-3 w-fit border-line bg-subtle text-muted">{t.category}</span>
              <h3 className="font-semibold">{t.name}</h3>
              <p className="mt-1 flex-1 text-sm text-muted">{t.description}</p>
              <p className="mt-3 text-xs text-muted">{t.preview?.nodeCount} nodes · {NODE_DEFS[t.preview?.triggerType]?.title}</p>
              <div className="mt-4 flex gap-2">
                <button className="btn btn-sm flex-1" onClick={() => openPreview(t)}><Eye size={13} />Preview</button>
                <button className="btn btn-primary btn-sm flex-1" onClick={() => clone(t)} disabled={cloning === t._id}>{cloning === t._id ? <Spinner size={13} className="text-current" /> : <Copy size={13} />}Use template</button>
              </div>
            </article>
          ))}
        </div>
      )}
      <Modal open={Boolean(preview)} onClose={() => setPreview(null)} wide title={preview?.name || 'Template'}
        footer={preview && <><button className="btn" onClick={() => setPreview(null)}>Close</button><button className="btn btn-primary" onClick={() => clone(preview)} disabled={cloning === preview._id}>Use template</button></>}>
        {preview && <p className="mb-3 text-sm text-muted">{preview.description}</p>}
        {previewLoading || !preview?.nodes ? <PageLoader /> : <TemplatePreview nodes={preview.nodes} edges={preview.edges} />}
      </Modal>
    </div>
  );
}
