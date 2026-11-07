import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';
import { Modal, Spinner, StatusBadge } from '../common/ui';
import { NodeTimeline } from '../../pages/ExecutionDetailPage';
import { formatDuration } from '../../utils/format';

const SAMPLE = { webhookTrigger: '{\n  "email": "jane@example.com",\n  "name": "Jane"\n}', manualTrigger: '{}', scheduleTrigger: '{}' };

export default function TestRunModal({ open, onClose, triggerType, running, result, error, onRun }) {
  const [text, setText] = useState('{}');
  const [parseError, setParseError] = useState('');
  useEffect(() => { if (open) { setText(SAMPLE[triggerType] || '{}'); setParseError(''); } }, [open, triggerType]);

  const run = () => {
    let parsed;
    try { parsed = text.trim() ? JSON.parse(text) : {}; } catch { setParseError('Sample payload must be valid JSON'); return; }
    setParseError('');
    onRun(parsed);
  };

  return (
    <Modal open={open} onClose={running ? undefined : onClose} wide title="Test workflow"
      footer={<><button className="btn" onClick={onClose} disabled={running}>Close</button><button className="btn btn-primary" onClick={run} disabled={running}>{running ? <Spinner size={14} className="text-current" /> : <Play size={14} />}{result ? 'Run again' : 'Run test'}</button></>}>
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <label className="label" htmlFor="test-input">{triggerType === 'webhookTrigger' ? 'Sample webhook body (JSON)' : 'Trigger payload (JSON, optional)'}</label>
          <textarea id="test-input" className="input min-h-[200px] font-mono text-xs" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} />
          {parseError && <p role="alert" className="mt-1 text-xs text-bad">{parseError}</p>}
          <p className="mt-2 text-xs text-muted">This runs the real workflow, including live HTTP requests, and is saved to Executions. It's available as <code className="font-mono">trigger.body</code>.</p>
        </div>
        <div className="lg:col-span-3">
          {error && <p role="alert" className="mb-3 rounded-md border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
          {running && <p className="flex items-center gap-2 text-sm text-muted"><Spinner />Running…</p>}
          {!running && !result && !error && <p className="text-sm text-muted">Results will appear here.</p>}
          {result && !running && (
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-3"><StatusBadge status={result.status} /><span className="text-xs text-muted">{formatDuration(result.duration)}</span><Link className="ml-auto text-xs text-accent hover:underline" to={`/executions/${result._id}`} target="_blank">Open full execution ↗</Link></div>
              {result.error?.message && <p role="alert" className="mb-3 rounded-md border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{result.error.message}</p>}
              <NodeTimeline results={result.nodeResults} />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
