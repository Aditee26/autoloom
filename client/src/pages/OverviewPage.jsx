import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Workflow, Zap, PauseCircle, Activity, CheckCircle2, XCircle, Percent, Plus, LayoutTemplate } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { dashboardApi } from '../services';
import { errorMessage } from '../services/api';
import { EmptyState, ErrorState, PageHeader, PageLoader, StatusBadge } from '../components/common/ui';
import { formatDuration, timeAgo, triggerLabel } from '../utils/format';

const COLORS = { success: 'rgb(var(--ok))', failed: 'rgb(var(--bad))', accent: 'rgb(var(--accent))', muted: 'rgb(var(--muted))' };

function StatCard({ icon: Icon, label, value, tone }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between text-muted"><span className="text-xs font-medium">{label}</span><Icon size={15} className={tone} /></div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
    </div>
  );
}

const shortDate = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const tooltipStyle = { background: 'rgb(var(--surface))', border: '1px solid rgb(var(--line))', borderRadius: 8, fontSize: 12, color: 'rgb(var(--fg))' };

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mb-3 text-xs text-muted">{subtitle}</p>
      <div className="h-56">{children}</div>
    </div>
  );
}

export default function OverviewPage() {
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [s, a] = await Promise.all([dashboardApi.stats(), dashboardApi.analytics(14)]);
      setStats(s.data); setAnalytics(a.data);
    } catch (err) { setError(errorMessage(err, 'Could not load the dashboard')); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!stats || !analytics) return <PageLoader />;

  const { workflows, executions } = stats;
  const isNew = workflows.total === 0;
  const pie = [{ name: 'Successful', value: executions.success, key: 'success' }, { name: 'Failed', value: executions.failed, key: 'failed' }].filter((p) => p.value > 0);
  const daily = analytics.daily.map((d) => ({ ...d, label: shortDate(d.date) }));

  return (
    <div className="fade-in">
      <PageHeader title="Overview" description="Activity across your workflows."
        actions={<Link to="/workflows?new=1" className="btn btn-primary"><Plus size={14} />New workflow</Link>} />

      {isNew ? (
        <div className="card">
          <EmptyState icon={Workflow} title="Build your first workflow"
            description="Connect a trigger to conditions and actions on a visual canvas. Start from scratch or clone a ready-made template."
            action={<div className="flex gap-2"><Link to="/workflows?new=1" className="btn btn-primary"><Plus size={14} />Create workflow</Link><Link to="/templates" className="btn"><LayoutTemplate size={14} />Browse templates</Link></div>} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard icon={Workflow} label="Total workflows" value={workflows.total} />
            <StatCard icon={Zap} label="Active" value={workflows.active} tone="text-ok" />
            <StatCard icon={PauseCircle} label="Inactive" value={workflows.inactive} />
            <StatCard icon={Activity} label="Total executions" value={executions.total} />
            <StatCard icon={CheckCircle2} label="Successful" value={executions.success} tone="text-ok" />
            <StatCard icon={XCircle} label="Failed" value={executions.failed} tone="text-bad" />
            <StatCard icon={Percent} label="Success rate" value={executions.successRate === null ? '—' : `${executions.successRate}%`} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ChartCard title="Daily executions" subtitle="Last 14 days, successful vs failed">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={daily} margin={{ left: -20, right: 4 }}>
                    <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }} tickLine={false} axisLine={false} interval={1} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgb(var(--subtle))' }} />
                    <Bar dataKey="success" name="Successful" stackId="a" fill={COLORS.success} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="failed" name="Failed" stackId="a" fill={COLORS.failed} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
            <ChartCard title="Success vs failed" subtitle="All finished executions">
              {pie.length === 0 ? <p className="flex h-full items-center justify-center text-sm text-muted">No finished executions yet</p> : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={78} paddingAngle={2} stroke="none">
                      {pie.map((p) => <Cell key={p.key} fill={COLORS[p.key]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          <div className="mt-4">
            <ChartCard title="Workflow activity" subtitle="Executions and distinct workflows that ran, per day">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daily} margin={{ left: -20, right: 8 }}>
                  <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }} tickLine={false} axisLine={false} interval={1} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="total" name="Executions" stroke={COLORS.accent} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="activeWorkflows" name="Workflows run" stroke={COLORS.muted} strokeWidth={2} dot={false} strokeDasharray="4 3" />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <section className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-4 py-3"><h3 className="text-sm font-semibold">Recent workflows</h3><Link to="/workflows" className="text-xs text-accent hover:underline">View all</Link></div>
              <ul className="divide-y divide-line">
                {stats.recentWorkflows.map((w) => (
                  <li key={w.id}>
                    <Link to={`/workflows/${w.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-subtle">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{w.name}</p>
                        <p className="truncate text-xs text-muted">{w.description || 'No description'}</p>
                        <p className="mt-0.5 text-xs text-muted">{w.totalExecutions} runs · last run {timeAgo(w.lastExecutedAt)} · updated {timeAgo(w.updatedAt)}</p>
                      </div>
                      <StatusBadge status={w.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
            <section className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-4 py-3"><h3 className="text-sm font-semibold">Recent executions</h3><Link to="/executions" className="text-xs text-accent hover:underline">View all</Link></div>
              {stats.recentExecutions.length === 0 ? <EmptyState icon={Activity} title="No executions yet" description="Run a workflow to see its history here." /> : (
                <ul className="divide-y divide-line">
                  {stats.recentExecutions.map((e) => (
                    <li key={e.id}>
                      <Link to={`/executions/${e.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-subtle">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{e.workflowName}</p>
                          <p className="text-xs text-muted">{triggerLabel[e.triggerType]} · {timeAgo(e.startedAt)} · {formatDuration(e.duration)}</p>
                        </div>
                        <StatusBadge status={e.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
