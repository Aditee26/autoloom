import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import AuthShell from './AuthForm';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../services/api';
import { Field, Spinner } from '../components/common/ui';

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dest = location.state?.from || '/overview';

  if (isAuthenticated) return <Navigate to={dest} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try { await login(form.email, form.password); navigate(dest, { replace: true }); }
    catch (err) { setError(errorMessage(err, 'Could not sign in')); }
    finally { setBusy(false); }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your AutoLoom workspace." footer={<>New to AutoLoom? <Link className="font-medium text-accent hover:underline" to="/register">Create an account</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <p role="alert" className="rounded-md border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
        <Field label="Email" htmlFor="email"><input id="email" className="input" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Password" htmlFor="password"><input id="password" className="input" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        <button className="btn btn-primary w-full" disabled={busy || !form.email || !form.password}>{busy && <Spinner size={14} className="text-current" />}Sign in</button>
      </form>
    </AuthShell>
  );
}
