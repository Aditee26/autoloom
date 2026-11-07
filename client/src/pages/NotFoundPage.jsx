import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <p className="text-5xl font-semibold tracking-tight">404</p>
      <p className="text-muted">That page doesn't exist.</p>
      <Link to="/overview" className="btn btn-primary">Back to overview</Link>
    </div>
  );
}
