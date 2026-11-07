import { useEffect, useRef, useState } from 'react';
import { Loader2, X, Copy, Check, ChevronRight } from 'lucide-react';

export function Spinner({ size = 16, className = '' }) {
  return <Loader2 size={size} className={`animate-spin text-muted ${className}`} aria-label="Loading" />;
}

export function PageLoader({ label = 'Loading…' }) {
  return <div className="flex h-64 items-center justify-center gap-2 text-muted" role="status"><Spinner /> {label}</div>;
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {Icon && <div className="mb-3 rounded-full border border-line bg-subtle p-3 text-muted"><Icon size={20} /></div>}
      <h3 className="text-sm font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="card flex flex-col items-center gap-3 p-8 text-center" role="alert">
      <p className="text-sm text-bad">{message}</p>
      {onRetry && <button className="btn btn-sm" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

const STATUS_STYLES = {
  success: 'border-ok/30 bg-ok/10 text-ok',
  active: 'border-ok/30 bg-ok/10 text-ok',
  failed: 'border-bad/30 bg-bad/10 text-bad',
  running: 'border-accent/30 bg-accent/10 text-accent',
  pending: 'border-warn/30 bg-warn/10 text-warn',
  cancelled: 'border-line bg-subtle text-muted',
  inactive: 'border-line bg-subtle text-muted',
  skipped: 'border-line bg-subtle text-muted',
};
export function StatusBadge({ status }) {
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
  return (
    <span className={`badge ${STATUS_STYLES[status] || STATUS_STYLES.inactive}`}>
      <span className={`h-1.5 w-1.5 rounded-full bg-current ${status === 'running' ? 'animate-pulse' : ''}`} />
      {label}
    </span>
  );
}

export function Modal({ open, onClose, title, children, footer, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`card fade-in flex max-h-[90vh] w-full flex-col shadow-pop ${wide ? 'max-w-4xl' : 'max-w-md'}`}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button className="text-muted hover:text-fg" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger = false, busy = false, onConfirm, onCancel, children }) {
  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onCancel}
      title={title}
      footer={(
        <>
          <button className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>
            {busy && <Spinner size={14} className="text-current" />}{confirmLabel}
          </button>
        </>
      )}
    >
      <p className="text-sm text-muted">{message}</p>
      {children}
    </Modal>
  );
}

export function CopyButton({ text, label = 'Copy', className = '' }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch { /* clipboard unavailable (insecure context); user can still select the text */ }
  };
  return (
    <button type="button" className={`btn btn-sm ${className}`} onClick={copy} aria-label={label}>
      {done ? <Check size={12} /> : <Copy size={12} />}{done ? 'Copied' : label}
    </button>
  );
}

export function JsonView({ value, maxHeight = 280 }) {
  if (value === undefined || value === null) return <p className="text-xs text-muted">No data</p>;
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return <pre className="overflow-auto rounded-md border border-line bg-subtle p-3 font-mono text-xs leading-relaxed" style={{ maxHeight }}>{text}</pre>;
}

export function Collapsible({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1 text-xs font-medium text-muted hover:text-fg" aria-expanded={open}>
        <ChevronRight size={12} className={`transition-transform ${open ? 'rotate-90' : ''}`} />{title}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p className="mt-1 text-xs text-bad">{error}</p>}
    </div>
  );
}

export function useDebounced(value, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return v;
}
