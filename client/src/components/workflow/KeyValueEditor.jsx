import { Plus, Trash2 } from 'lucide-react';

export default function KeyValueEditor({ label, items = [], onChange, keyPlaceholder = 'Key', valuePlaceholder = 'Value' }) {
  const update = (i, patch) => onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="label mb-0">{label}</span>
        <button type="button" className="btn btn-sm" onClick={() => onChange([...items, { key: '', value: '' }])} aria-label={`Add ${label.toLowerCase()}`}><Plus size={12} />Add</button>
      </div>
      {items.length === 0 && <p className="text-xs text-muted">None</p>}
      {items.map((it, i) => (
        <div key={i} className="mb-1.5 flex gap-1.5">
          <input className="input" placeholder={keyPlaceholder} aria-label={`${label} key ${i + 1}`} value={it.key} onChange={(e) => update(i, { key: e.target.value })} />
          <input className="input" placeholder={valuePlaceholder} aria-label={`${label} value ${i + 1}`} value={it.value} onChange={(e) => update(i, { value: e.target.value })} />
          <button type="button" className="btn btn-ghost px-2" aria-label={`Remove ${label.toLowerCase()} ${i + 1}`} onClick={() => onChange(items.filter((_, idx) => idx !== i))}><Trash2 size={14} /></button>
        </div>
      ))}
    </div>
  );
}
