import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useBlocker, useParams } from 'react-router-dom';
import { Background, BackgroundVariant, Controls, MarkerType, MiniMap, ReactFlow, ReactFlowProvider, applyEdgeChanges, applyNodeChanges, useReactFlow } from '@xyflow/react';
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, CircleAlert, Copy, Eraser, Play, Power, PowerOff, Save } from 'lucide-react';
import { integrationApi, workflowApi } from '../services';
import { errorMessage } from '../services/api';
import { useToast } from '../context/ToastContext';
import { ConfirmDialog, ErrorState, PageLoader, Spinner } from '../components/common/ui';
import { nodeTypes } from '../components/nodes/FlowNode';
import NodeLibrary, { DRAG_MIME } from '../components/workflow/NodeLibrary';
import NodeConfigPanel from '../components/workflow/NodeConfigPanel';
import TestRunModal from '../components/workflow/TestRunModal';
import { NODE_DEFS, createNode, isTrigger } from '../utils/nodeDefs';
import { validateWorkflow, wouldCreateCycle } from '../utils/validateWorkflow';

const AUTOSAVE_MS = 1200;
const EDGE_COLORS = { true: 'rgb(var(--ok))', false: 'rgb(var(--bad))' };

const decorateEdge = (e) => ({
  ...e,
  type: 'smoothstep',
  markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
  ...(e.sourceHandle && EDGE_COLORS[e.sourceHandle] ? { style: { stroke: EDGE_COLORS[e.sourceHandle] } } : {}),
});
// Only persist what the server needs: no selection, measurement or runtime fields.
const persistNode = (n) => ({ id: n.id, type: n.type, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) }, data: { label: n.data.label, config: n.data.config } });
const persistEdge = (e) => ({ id: e.id, source: e.source, target: e.target, ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}) });

const SAVE_LABEL = {
  saved: { text: 'Saved', icon: Check, cls: 'text-ok' },
  saving: { text: 'Saving…', icon: Spinner, cls: 'text-muted' },
  dirty: { text: 'Unsaved changes', icon: CircleAlert, cls: 'text-warn' },
  failed: { text: 'Save failed', icon: AlertTriangle, cls: 'text-bad' },
};

function upstreamIds(nodeId, edges) {
  const seen = new Set();
  const stack = [nodeId];
  while (stack.length) {
    const id = stack.pop();
    for (const e of edges) if (e.target === id && !seen.has(e.source)) { seen.add(e.source); stack.push(e.source); }
  }
  return [...seen];
}

function Editor() {
  const { id } = useParams();
  const toast = useToast();
  const { screenToFlowPosition, fitView, getViewport } = useReactFlow();
  const wrapperRef = useRef(null);

  const [meta, setMeta] = useState(null); // name, status, webhookUrl, triggerType
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [saveState, setSaveState] = useState('saved');
  const [integrations, setIntegrations] = useState([]);
  const [runStatus, setRunStatus] = useState({});
  const [showIssues, setShowIssues] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testError, setTestError] = useState('');
  const [toggling, setToggling] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const versionRef = useRef(0);
  const [version, setVersion] = useState(0);
  const latest = useRef({});
  latest.current = { nodes, edges, name: meta?.name };

  const markDirty = useCallback(() => { versionRef.current += 1; setVersion(versionRef.current); setSaveState('dirty'); }, []);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const res = await workflowApi.get(id);
      const wf = res.data;
      setMeta({ name: wf.name, status: wf.status, webhookUrl: wf.webhookUrl, triggerType: wf.triggerType });
      setNodes(wf.nodes);
      setEdges(wf.edges.map(decorateEdge));
      setSaveState('saved');
      setTimeout(() => fitView({ padding: 0.25, maxZoom: 1 }), 50);
    } catch (err) { setLoadError(errorMessage(err, 'Could not load the workflow')); }
  }, [id, fitView]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { integrationApi.list().then((r) => setIntegrations(r.data)).catch(() => {}); }, []);

  // ---- saving -------------------------------------------------------------
  const save = useCallback(async () => {
    const v = versionRef.current;
    const { nodes: n, edges: e, name } = latest.current;
    setSaveState('saving');
    try {
      const res = await workflowApi.update(id, { name, nodes: n.map(persistNode), edges: e.map(persistEdge) });
      const wf = res.data;
      setMeta((m) => ({ ...m, status: wf.status, webhookUrl: wf.webhookUrl, triggerType: wf.triggerType }));
      setSaveState(versionRef.current === v ? 'saved' : 'dirty');
      return true;
    } catch (err) {
      setSaveState('failed');
      toast.error(errorMessage(err, 'Could not save the workflow'));
      return false;
    }
  }, [id, toast]);

  useEffect(() => {
    if (version === 0) return undefined;
    const t = setTimeout(save, AUTOSAVE_MS); // debounce: restarts on every change
    return () => clearTimeout(t);
  }, [version, save]);

  const unsaved = saveState !== 'saved';
  useEffect(() => {
    const h = (e) => { if (unsaved) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [unsaved]);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => unsaved && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => { if (blocker.state === 'blocked') setLeaving(true); }, [blocker.state]);

  // ---- canvas handlers ----------------------------------------------------
  const onNodesChange = useCallback((changes) => {
    setNodes((ns) => applyNodeChanges(changes, ns));
    if (changes.some((c) => c.type === 'remove' || c.type === 'add' || (c.type === 'position' && c.dragging === false))) markDirty();
  }, [markDirty]);
  const onEdgesChange = useCallback((changes) => {
    setEdges((es) => applyEdgeChanges(changes, es));
    if (changes.some((c) => c.type === 'remove' || c.type === 'add')) markDirty();
  }, [markDirty]);

  const isValidConnection = useCallback((c) => {
    if (!c.source || !c.target || c.source === c.target) return false;
    const target = nodes.find((n) => n.id === c.target);
    if (!target || isTrigger(target.type)) return false;
    if (edges.some((e) => e.source === c.source && e.target === c.target && (e.sourceHandle || null) === (c.sourceHandle || null))) return false;
    return !wouldCreateCycle(edges, c.source, c.target);
  }, [nodes, edges]);

  const onConnect = useCallback((c) => {
    if (!isValidConnection(c)) { toast.error('That connection is not allowed (loops and duplicate links are blocked)'); return; }
    const edge = decorateEdge({ id: `e_${c.source}_${c.sourceHandle || 'out'}_${c.target}`, source: c.source, target: c.target, ...(c.sourceHandle ? { sourceHandle: c.sourceHandle } : {}) });
    setEdges((es) => es.filter((e) => e.id !== edge.id).concat(edge));
    markDirty();
  }, [isValidConnection, markDirty, toast]);

  const addNode = useCallback((type, position) => {
    if (isTrigger(type) && nodes.some((n) => isTrigger(n.type))) { toast.error('A workflow can only have one trigger'); return; }
    const pos = position || (() => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      const p = screenToFlowPosition({ x: (rect?.left || 0) + (rect?.width || 600) / 2, y: (rect?.top || 0) + (rect?.height || 400) / 2 });
      return { x: p.x - 115 + (nodes.length % 5) * 24, y: p.y - 40 + (nodes.length % 5) * 24 };
    })();
    const node = createNode(type, pos, nodes);
    setNodes((ns) => ns.map((n) => ({ ...n, selected: false })).concat({ ...node, selected: true }));
    markDirty();
  }, [nodes, toast, screenToFlowPosition, markDirty]);

  const onDrop = (e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData(DRAG_MIME);
    if (!NODE_DEFS[type]) return;
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    addNode(type, { x: p.x - 115, y: p.y - 30 });
  };

  const selected = nodes.filter((n) => n.selected);
  const selectedNode = selected.length === 1 ? selected[0] : null;

  const updateNodeData = (nodeId, patch) => {
    setNodes((ns) => ns.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)));
    markDirty();
  };
  const deleteNode = (nodeId) => {
    setNodes((ns) => ns.filter((n) => n.id !== nodeId));
    setEdges((es) => es.filter((e) => e.source !== nodeId && e.target !== nodeId));
    markDirty();
  };
  const duplicateSelected = useCallback(() => {
    const targets = selected.filter((n) => !isTrigger(n.type));
    if (!targets.length) { if (selected.length) toast.error('Triggers cannot be duplicated'); return; }
    setNodes((ns) => {
      let all = ns.map((n) => ({ ...n, selected: false }));
      for (const n of targets) {
        const nid = createNode(n.type, n.position, all).id;
        all = all.concat({ id: nid, type: n.type, position: { x: n.position.x + 40, y: n.position.y + 60 }, selected: true, data: { label: `${n.data.label} copy`.slice(0, 80), config: JSON.parse(JSON.stringify(n.data.config || {})) } });
      }
      return all;
    });
    markDirty();
  }, [selected, markDirty, toast]);

  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) { e.preventDefault(); duplicateSelected(); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [duplicateSelected, save]);

  // ---- derived view state -------------------------------------------------
  const validation = useMemo(() => validateWorkflow(nodes, edges), [nodes, edges]);
  const displayNodes = useMemo(() => nodes.map((n) => ({ ...n, data: { ...n.data, nodeId: n.id, status: runStatus[n.id], errors: validation.nodeErrors[n.id] } })), [nodes, runStatus, validation]);
  const triggerNode = nodes.find((n) => isTrigger(n.type));

  // ---- actions ------------------------------------------------------------
  const applyRun = (execution) => {
    const map = {};
    execution.nodeResults.forEach((r) => { map[r.nodeId] = r.status; });
    nodes.forEach((n) => { if (!map[n.id]) map[n.id] = 'skipped'; });
    setRunStatus(map);
  };

  const runTest = async (input) => {
    setTestError(''); setTestResult(null); setTesting(true);
    try {
      if (unsaved && !(await save())) throw new Error('Save the workflow before testing');
      const res = await workflowApi.execute(id, input);
      setTestResult(res.data); applyRun(res.data);
    } catch (err) {
      const details = err.response?.data?.details;
      setTestError(Array.isArray(details) && details.length ? `${errorMessage(err)}: ${details.join('; ')}` : errorMessage(err, 'Test run failed'));
    } finally { setTesting(false); }
  };

  const toggleActive = async () => {
    setToggling(true);
    try {
      if (unsaved && !(await save())) return;
      const next = meta.status === 'active' ? 'inactive' : 'active';
      const res = await workflowApi.setStatus(id, next);
      setMeta((m) => ({ ...m, status: res.data.status }));
      toast.success(next === 'active' ? 'Workflow activated' : 'Workflow deactivated');
    } catch (err) {
      const details = err.response?.data?.details;
      toast.error(Array.isArray(details) && details.length ? `${errorMessage(err)}: ${details[0]}` : errorMessage(err));
    } finally { setToggling(false); }
  };

  if (loadError) return <div className="p-8"><ErrorState message={loadError} onRetry={load} /></div>;
  if (!meta) return <PageLoader />;

  const ss = SAVE_LABEL[saveState];
  const isManual = meta.triggerType === 'manual';

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
        <Link to="/workflows" className="btn btn-ghost px-2" aria-label="Back to workflows"><ArrowLeft size={16} /></Link>
        <input aria-label="Workflow name" className="w-56 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-semibold hover:border-line focus:border-accent focus:outline-none sm:w-72" maxLength={120}
          value={meta.name} onChange={(e) => { setMeta({ ...meta, name: e.target.value }); markDirty(); }} onBlur={() => { if (!meta.name.trim()) { setMeta({ ...meta, name: 'Untitled workflow' }); markDirty(); } }} />
        <span className={`hidden items-center gap-1 text-xs sm:flex ${ss.cls}`} role="status" aria-live="polite"><ss.icon size={13} />{ss.text}</span>
        <div className="ml-auto flex items-center gap-2">
          <button className={`btn btn-sm ${validation.valid ? 'text-ok' : 'text-warn'}`} onClick={() => setShowIssues((s) => !s)} aria-pressed={showIssues}>
            {validation.valid ? <><CheckCircle2 size={14} />Valid</> : <><AlertTriangle size={14} />{validation.errors.length} issue{validation.errors.length === 1 ? '' : 's'}</>}
          </button>
          {Object.keys(runStatus).length > 0 && <button className="btn btn-sm" onClick={() => setRunStatus({})}><Eraser size={13} />Clear results</button>}
          <button className="btn btn-sm" onClick={() => { setTestResult(null); setTestError(''); setTestOpen(true); }} disabled={!validation.valid} title={validation.valid ? 'Run this workflow now' : 'Fix the issues first'}><Play size={13} />Test workflow</button>
          {!isManual && (
            <button className={`btn btn-sm ${meta.status === 'active' ? '' : 'btn-primary'}`} onClick={toggleActive} disabled={toggling || (meta.status !== 'active' && !validation.valid)}>
              {toggling ? <Spinner size={13} className="text-current" /> : meta.status === 'active' ? <PowerOff size={13} /> : <Power size={13} />}{meta.status === 'active' ? 'Deactivate' : 'Activate'}
            </button>
          )}
          <button className="btn btn-sm" onClick={save} disabled={saveState === 'saving' || saveState === 'saved'}><Save size={13} />Save</button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 border-r border-line bg-surface md:block"><NodeLibrary onAdd={(t) => addNode(t)} hasTrigger={Boolean(triggerNode)} /></aside>

        <div className="relative min-w-0 flex-1" ref={wrapperRef} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }} onDrop={onDrop} data-testid="canvas">
          <ReactFlow nodes={displayNodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
            isValidConnection={isValidConnection} deleteKeyCode={['Backspace', 'Delete']} minZoom={0.2} maxZoom={1.75} fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
            defaultEdgeOptions={{ type: 'smoothstep' }} proOptions={{ hideAttribution: true }} multiSelectionKeyCode="Shift">
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="rgb(var(--line))" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable className="!hidden lg:!block" nodeColor={() => 'rgb(var(--muted))'} maskColor="rgb(var(--bg) / 0.6)" />
          </ReactFlow>
          {nodes.length === 0 && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><p className="rounded-md border border-dashed border-line bg-surface px-4 py-3 text-sm text-muted">Drag a trigger from the library to begin</p></div>}
          {selectedNode && !isTrigger(selectedNode.type) && <button className="btn btn-sm absolute left-3 top-3 shadow-card" onClick={duplicateSelected} title="Ctrl/⌘ + D"><Copy size={13} />Duplicate node</button>}
        </div>

        <aside className="hidden w-80 shrink-0 border-l border-line bg-surface lg:block" aria-label="Node configuration">
          {selectedNode ? (
            <NodeConfigPanel key={selectedNode.id} node={selectedNode} upstream={upstreamIds(selectedNode.id, edges)} integrations={integrations} webhookUrl={meta.webhookUrl}
              errors={validation.nodeErrors[selectedNode.id]} onLabel={(label) => updateNodeData(selectedNode.id, { label })}
              onConfig={(config) => updateNodeData(selectedNode.id, { config })} onDelete={() => deleteNode(selectedNode.id)} onDuplicate={duplicateSelected}
              onClose={() => setNodes((ns) => ns.map((n) => ({ ...n, selected: false })))} />
          ) : (
            <div className="flex h-full flex-col" data-testid="workflow-summary">
              <div className="border-b border-line px-4 py-3"><h2 className="text-sm font-semibold">Workflow</h2><p className="text-xs text-muted">Select a node to configure it.</p></div>
              <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm">
                <div className="grid grid-cols-2 gap-3 text-xs"><div><p className="text-muted">Status</p><p className="font-medium capitalize">{meta.status}</p></div><div><p className="text-muted">Nodes</p><p className="font-medium">{nodes.length}</p></div></div>
                <div>
                  <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Validation</h3>
                  {validation.valid ? <p className="flex items-center gap-1.5 text-ok"><CheckCircle2 size={14} />Ready to run</p> : <ul className="space-y-1 text-xs text-warn">{validation.errors.map((e) => <li key={e}>• {e}</li>)}</ul>}
                </div>
                <p className="text-xs text-muted">Changes save automatically. Press <kbd className="rounded border border-line px-1">Ctrl/⌘ S</kbd> to save now.</p>
              </div>
            </div>
          )}
        </aside>
      </div>

      {showIssues && !validation.valid && (
        <div className="card absolute right-4 top-16 z-30 w-80 p-3 shadow-pop" role="dialog" aria-label="Validation issues">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Issues to fix</p>
          <ul className="space-y-1 text-xs text-warn">{validation.errors.map((e) => <li key={e}>• {e}</li>)}</ul>
        </div>
      )}

      <TestRunModal open={testOpen} onClose={() => setTestOpen(false)} triggerType={triggerNode?.type} running={testing} result={testResult} error={testError} onRun={runTest} />
      <ConfirmDialog open={leaving} title="Unsaved changes" message="This workflow has changes that haven't been saved yet."
        confirmLabel="Save & leave" busy={false}
        onConfirm={async () => { if (await save()) { setLeaving(false); blocker.proceed?.(); } }}
        onCancel={() => { setLeaving(false); blocker.reset?.(); }}>
        <button className="btn btn-sm mt-3 text-bad" onClick={() => { setLeaving(false); blocker.proceed?.(); }}>Discard changes & leave</button>
      </ConfirmDialog>
    </div>
  );
}

export default function WorkflowEditorPage() {
  return <ReactFlowProvider><Editor /></ReactFlowProvider>;
}
