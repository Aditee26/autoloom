import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import AuthShell from './AuthForm';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../services/api';
import { Field, Spinner } from '../components/common/ui';

export default function RegisterPage() {
  const { register, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (isAuthenticated) return <Navigate to="/overview" replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setError(''); setBusy(true);
    try { await register(form.name, form.email, form.password); navigate('/overview', { replace: true }); }
    catch (err) { setError(errorMessage(err, 'Could not create the account')); }
    finally { setBusy(false); }
  };

  return (
    <AuthShell title="Create your account" subtitle="Start automating in minutes." footer={<>Already have an account? <Link className="font-medium text-accent hover:underline" to="/login">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <p role="alert" className="rounded-md border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
        <Field label="Name" htmlFor="name"><input id="name" className="input" autoComplete="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Email" htmlFor="email"><input id="email" className="input" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters"><input id="password" className="input" type="password" autoComplete="new-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        <button className="btn btn-primary w-full" disabled={busy || !form.name || !form.email || !form.password}>{busy && <Spinner size={14} className="text-current" />}Create account</button>
      </form>
    </AuthShell>
  );
}
