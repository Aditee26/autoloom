import { libraryByCategory } from '../../utils/nodeDefs';

export const DRAG_MIME = 'application/autoloom-node';

export default function NodeLibrary({ onAdd, hasTrigger }) {
  return (
    <div className="flex h-full flex-col" data-testid="node-library">
      <div className="border-b border-line px-4 py-3"><h2 className="text-sm font-semibold">Nodes</h2><p className="text-xs text-muted">Drag onto the canvas, or click to add.</p></div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {libraryByCategory().map(({ category, items }) => (
          <section key={category} aria-label={category}>
            <h3 className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wider text-muted">{category}</h3>
            <div className="space-y-1.5">
              {items.map((def) => {
                const Icon = def.icon;
                const disabled = def.kind === 'trigger' && hasTrigger;
                return (
                  <button key={def.type} type="button" draggable={!disabled} disabled={disabled}
                    onDragStart={(e) => { e.dataTransfer.setData(DRAG_MIME, def.type); e.dataTransfer.effectAllowed = 'move'; }}
                    onClick={() => onAdd(def.type)}
                    title={disabled ? 'A workflow can only have one trigger' : `Add ${def.title}`}
                    className="flex w-full cursor-grab items-center gap-2.5 rounded-md border border-line bg-surface px-2.5 py-2 text-left transition-colors hover:border-accent/60 hover:bg-subtle active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-45">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-subtle text-muted"><Icon size={15} /></span>
                    <span className="min-w-0"><span className="block text-[13px] font-medium leading-tight">{def.title}</span><span className="block truncate text-xs text-muted">{def.description}</span></span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
