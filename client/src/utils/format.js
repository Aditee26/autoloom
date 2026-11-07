export function formatDuration(ms) {
  if (ms === undefined || ms === null) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`;
  const m = Math.floor(ms / 60000);
  return `${m}m ${Math.round((ms % 60000) / 1000)}s`;
}

export function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function timeAgo(value, now = Date.now()) {
  if (!value) return 'Never';
  const s = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  return new Date(value).toLocaleDateString();
}

export const triggerLabel = { manual: 'Manual', webhook: 'Webhook', schedule: 'Schedule', retry: 'Retry', none: 'No trigger' };
