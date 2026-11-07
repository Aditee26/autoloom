import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import { ToastProvider } from '../context/ToastContext';
import ProtectedRoute from './ProtectedRoute';
import AppLayout from '../components/layout/AppLayout';
import LoginPage from '../pages/LoginPage';
import RegisterPage from '../pages/RegisterPage';
import OverviewPage from '../pages/OverviewPage';
import WorkflowsPage from '../pages/WorkflowsPage';
import ExecutionsPage from '../pages/ExecutionsPage';
import ExecutionDetailPage from '../pages/ExecutionDetailPage';
import TemplatesPage from '../pages/TemplatesPage';
import IntegrationsPage from '../pages/IntegrationsPage';
import SettingsPage from '../pages/SettingsPage';
import WorkflowEditorPage from '../pages/WorkflowEditorPage';
import NotFoundPage from '../pages/NotFoundPage';

function Providers() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <ToastProvider><Outlet /></ToastProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

// A data router (rather than <BrowserRouter>) is required for useBlocker, which powers the unsaved-changes warning.
export const router = createBrowserRouter([
  {
    element: <Providers />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      {
        element: <ProtectedRoute />,
        children: [
          { path: '/workflows/:id', element: <WorkflowEditorPage /> },
          {
            element: <AppLayout />,
            children: [
              { path: '/', element: <Navigate to="/overview" replace /> },
              { path: '/overview', element: <OverviewPage /> },
              { path: '/workflows', element: <WorkflowsPage /> },
              { path: '/executions', element: <ExecutionsPage /> },
              { path: '/executions/:id', element: <ExecutionDetailPage /> },
              { path: '/templates', element: <TemplatesPage /> },
              { path: '/integrations', element: <IntegrationsPage /> },
              { path: '/settings', element: <SettingsPage /> },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
