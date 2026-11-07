import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { LayoutDashboard, Workflow, Activity, LayoutTemplate, Plug, Settings, Search, Bell, Sun, Moon, LogOut, User, Menu, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { executionApi } from '../../services';
import { timeAgo } from '../../utils/format';

export const NAV = [
  { to: '/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/workflows', label: 'Workflows', icon: Workflow },
  { to: '/executions', label: 'Executions', icon: Activity },
  { to: '/templates', label: 'Templates', icon: LayoutTemplate },
  { to: '/integrations', label: 'Integrations', icon: Plug },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Logo({ size = 28 }) {
  return (
    <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="rgb(var(--accent))" /><path d="M9 10h9a4 4 0 0 1 0 8h-4M9 22h6" stroke="rgb(var(--accent-fg))" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      AutoLoom
    </span>
  );
}

function useOutsideClose(ref, onClose) {
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onClose]);
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const ref = useRef(null);
  useOutsideClose(ref, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    executionApi.list({ status: 'failed', limit: 6 }).then((r) => setItems(r.data)).catch(() => setItems([]));
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button className="btn btn-ghost px-2" onClick={() => setOpen(!open)} aria-label="Notifications" aria-expanded={open}><Bell size={16} /></button>
      {open && (
        <div className="card fade-in absolute right-0 z-40 mt-2 w-80 p-1 shadow-pop">
          <p className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted">Recent failures</p>
          {items.length === 0 && <p className="px-3 pb-3 text-sm text-muted">No failed executions. 🎉</p>}
          {items.map((e) => (
            <Link key={e._id} to={`/executions/${e._id}`} onClick={() => setOpen(false)} className="menu-item flex-col items-start gap-0">
              <span className="font-medium">{e.workflowName}</span>
              <span className="w-full truncate text-xs text-muted">{e.error?.message || 'Failed'} · {timeAgo(e.startedAt)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutsideClose(ref, () => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      <button className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-fg" onClick={() => setOpen(!open)} aria-label="Account menu" aria-expanded={open}>
        {user?.name?.[0]?.toUpperCase() || 'U'}
      </button>
      {open && (
        <div className="card fade-in absolute right-0 z-40 mt-2 w-60 p-1 shadow-pop">
          <div className="border-b border-line px-3 py-2"><p className="truncate font-medium">{user?.name}</p><p className="truncate text-xs text-muted">{user?.email}</p></div>
          <button className="menu-item mt-1" onClick={() => { setOpen(false); navigate('/settings'); }}><User size={14} />Profile & settings</button>
          <button className="menu-item" onClick={() => { logout(); navigate('/login'); }}><LogOut size={14} />Sign out</button>
        </div>
      )}
    </div>
  );
}

function Topbar({ onMenu }) {
  const { user } = useAuth();
  const theme = useTheme();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const submit = (e) => { e.preventDefault(); if (q.trim()) navigate(`/workflows?search=${encodeURIComponent(q.trim())}`); };
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
      <button className="btn btn-ghost px-2 lg:hidden" onClick={onMenu} aria-label="Open navigation"><Menu size={18} /></button>
      <div className="hidden items-center gap-2 rounded-md border border-line bg-subtle px-2.5 py-1 text-xs sm:flex" title="Current workspace">
        <span className="h-2 w-2 rounded-full bg-ok" />
        <span className="max-w-[160px] truncate font-medium">{user?.workspaceName || 'My Workspace'}</span>
      </div>
      <form onSubmit={submit} className="relative ml-auto max-w-sm flex-1" role="search">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
        <input className="input pl-8" placeholder="Search workflows…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search workflows" />
      </form>
      <Notifications />
      <button className="btn btn-ghost px-2" onClick={theme.toggle} aria-label="Toggle theme">{theme.resolved === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
      <ProfileMenu />
    </header>
  );
}

function SidebarNav({ onNavigate }) {
  return (
    <nav className="flex-1 space-y-0.5 px-3 py-4" aria-label="Main">
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} onClick={onNavigate}
          className={({ isActive }) => `flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ${isActive ? 'bg-subtle font-medium text-fg' : 'text-muted hover:bg-subtle hover:text-fg'}`}>
          <Icon size={16} />{label}
        </NavLink>
      ))}
    </nav>
  );
}

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="flex h-full">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-14 items-center px-5"><Logo /></div>
        <SidebarNav />
        <p className="px-5 py-4 text-xs text-muted">Connect. Automate. Execute.</p>
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="flex w-64 flex-col border-r border-line bg-surface">
            <div className="flex h-14 items-center justify-between px-5"><Logo /><button onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={18} /></button></div>
            <SidebarNav onNavigate={() => setMobileOpen(false)} />
          </div>
          <div className="flex-1 bg-black/40" onClick={() => setMobileOpen(false)} />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto"><div className="mx-auto max-w-6xl px-4 py-6 sm:px-6"><Outlet /></div></main>
      </div>
    </div>
  );
}
