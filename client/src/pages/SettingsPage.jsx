import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Monitor, Moon, Sun } from 'lucide-react';
import { authApi } from '../services';
import { errorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { ConfirmDialog, Field, PageHeader, Spinner } from '../components/common/ui';

function Section({ title, description, children }) {
  return (
    <section className="card mb-5">
      <div className="border-b border-line px-5 py-3"><h2 className="font-semibold">{title}</h2>{description && <p className="text-xs text-muted">{description}</p>}</div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const { user, setUser, logout } = useAuth();
  const theme = useTheme();
  const toast = useToast();
  const navigate = useNavigate();

  const [profile, setProfile] = useState({ name: user.name, workspaceName: user.workspaceName });
  const [prefs, setPrefs] = useState({ defaultHttpTimeoutMs: user.preferences?.defaultHttpTimeoutMs ?? 10000, defaultRetries: user.preferences?.defaultRetries ?? 0 });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [busy, setBusy] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deletePw, setDeletePw] = useState('');

  const save = (key, fn, success) => async (e) => {
    e?.preventDefault();
    setBusy(key);
    try { await fn(); toast.success(success); } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(''); }
  };

  const saveProfile = save('profile', async () => { setUser((await authApi.updateProfile({ name: profile.name.trim(), workspaceName: profile.workspaceName.trim() })).data.user); }, 'Profile saved');
  const savePrefs = save('prefs', async () => { setUser((await authApi.updateProfile({ preferences: { defaultHttpTimeoutMs: Number(prefs.defaultHttpTimeoutMs), defaultRetries: Number(prefs.defaultRetries) } })).data.user); }, 'Execution preferences saved');
  const changePw = async (e) => {
    e.preventDefault();
    if (pw.newPassword !== pw.confirm) { toast.error('New passwords do not match'); return; }
    await save('pw', async () => { await authApi.changePassword({ currentPassword: pw.currentPassword, newPassword: pw.newPassword }); setPw({ currentPassword: '', newPassword: '', confirm: '' }); }, 'Password updated')();
  };
  const deleteAccount = async () => {
    setBusy('delete');
    try { await authApi.deleteAccount(deletePw); logout(); navigate('/register', { replace: true }); }
    catch (err) { toast.error(errorMessage(err)); setBusy(''); }
  };

  return (
    <div className="fade-in max-w-2xl">
      <PageHeader title="Settings" description="Manage your profile, workspace and account." />

      <Section title="Profile" description="Your name and workspace appear across the app.">
        <form onSubmit={saveProfile} className="space-y-4">
          <Field label="Name" htmlFor="s-name"><input id="s-name" className="input" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} maxLength={80} /></Field>
          <Field label="Email" htmlFor="s-email"><input id="s-email" className="input" value={user.email} disabled /></Field>
          <Field label="Workspace name" htmlFor="s-ws"><input id="s-ws" className="input" value={profile.workspaceName} onChange={(e) => setProfile({ ...profile, workspaceName: e.target.value })} maxLength={80} /></Field>
          <button className="btn btn-primary" disabled={busy === 'profile' || !profile.name.trim() || !profile.workspaceName.trim()}>{busy === 'profile' && <Spinner size={14} className="text-current" />}Save profile</button>
        </form>
      </Section>

      <Section title="Appearance">
        <div className="flex gap-2" role="radiogroup" aria-label="Theme">
          {[['light', Sun, 'Light'], ['dark', Moon, 'Dark'], ['system', Monitor, 'System']].map(([v, Icon, label]) => (
            <button key={v} role="radio" aria-checked={theme.mode === v} onClick={() => theme.setMode(v)} className={`btn ${theme.mode === v ? 'border-accent bg-accent/10 text-accent' : ''}`}><Icon size={14} />{label}</button>
          ))}
        </div>
      </Section>

      <Section title="Workflow execution" description="Defaults for HTTP Request nodes that don't set their own values.">
        <form onSubmit={savePrefs} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Default timeout (ms)" htmlFor="s-timeout" hint="100 – 30000"><input id="s-timeout" className="input" type="number" min={100} max={30000} value={prefs.defaultHttpTimeoutMs} onChange={(e) => setPrefs({ ...prefs, defaultHttpTimeoutMs: e.target.value })} /></Field>
            <Field label="Default retries" htmlFor="s-retries" hint="0 – 3, on network errors, 429 and 5xx"><input id="s-retries" className="input" type="number" min={0} max={3} value={prefs.defaultRetries} onChange={(e) => setPrefs({ ...prefs, defaultRetries: e.target.value })} /></Field>
          </div>
          <button className="btn btn-primary" disabled={busy === 'prefs'}>{busy === 'prefs' && <Spinner size={14} className="text-current" />}Save preferences</button>
        </form>
      </Section>

      <Section title="Password">
        <form onSubmit={changePw} className="space-y-4">
          <Field label="Current password" htmlFor="s-cur"><input id="s-cur" className="input" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
          <Field label="New password" htmlFor="s-new" hint="At least 8 characters"><input id="s-new" className="input" type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
          <Field label="Confirm new password" htmlFor="s-conf"><input id="s-conf" className="input" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
          <button className="btn btn-primary" disabled={busy === 'pw' || !pw.currentPassword || pw.newPassword.length < 8}>{busy === 'pw' && <Spinner size={14} className="text-current" />}Update password</button>
        </form>
      </Section>

      <section className="card border-bad/40">
        <div className="border-b border-bad/30 px-5 py-3"><h2 className="font-semibold text-bad">Danger zone</h2></div>
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="max-w-md text-sm text-muted">Permanently delete your account, all workflows, executions and integrations. This cannot be undone.</p>
          <button className="btn btn-danger" onClick={() => { setDeletePw(''); setDeleting(true); }}>Delete account</button>
        </div>
      </section>

      <ConfirmDialog open={deleting} danger busy={busy === 'delete'} title="Delete account" confirmLabel="Delete everything" message="Enter your password to confirm. All your data will be permanently removed." onConfirm={deleteAccount} onCancel={() => setDeleting(false)}>
        <div className="mt-3"><Field label="Password" htmlFor="del-pw"><input id="del-pw" className="input" type="password" autoComplete="current-password" value={deletePw} onChange={(e) => setDeletePw(e.target.value)} /></Field></div>
      </ConfirmDialog>
    </div>
  );
}
