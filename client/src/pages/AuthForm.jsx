import { Logo } from '../components/layout/AppLayout';

export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center text-lg"><Logo size={32} /></div>
        <div className="card p-6">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          <p className="mb-5 mt-1 text-sm text-muted">{subtitle}</p>
          {children}
        </div>
        <p className="mt-4 text-center text-sm text-muted">{footer}</p>
      </div>
    </div>
  );
}
