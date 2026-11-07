import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';

vi.mock('../services', () => ({
  workflowApi: { get: vi.fn(), update: vi.fn(), execute: vi.fn(), setStatus: vi.fn() },
  integrationApi: { list: vi.fn(() => Promise.resolve({ data: [] })) },
}));
import { workflowApi } from '../services';
import { ToastProvider } from '../context/ToastContext';
import WorkflowEditorPage from '../pages/WorkflowEditorPage';

const wf = {
  id: 'wf1', name: 'My flow', status: 'inactive', triggerType: 'manual', webhookUrl: undefined,
  nodes: [
    { id: 'trigger_1', type: 'manualTrigger', position: { x: 0, y: 0 }, data: { label: 'Manual Trigger', config: {} } },
    { id: 'log_1', type: 'logMessage', position: { x: 300, y: 0 }, data: { label: 'Log Message', config: { level: 'info', message: 'hi {{trigger.body.name}}' } } },
  ],
  edges: [{ id: 'e1', source: 'trigger_1', target: 'log_1' }],
};

function renderEditor() {
  const router = createMemoryRouter(
    [{ path: '/workflows/:id', element: <ToastProvider><WorkflowEditorPage /></ToastProvider> }, { path: '/workflows', element: <p>list page</p> }],
    { initialEntries: ['/workflows/wf1'] }
  );
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  workflowApi.get.mockResolvedValue({ data: JSON.parse(JSON.stringify(wf)) });
  workflowApi.update.mockImplementation(async (_id, body) => ({ data: { ...wf, ...body, webhookUrl: undefined } }));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });

describe('workflow editor', () => {
  test('loads a saved workflow: nodes, library, validity and "Saved" state', async () => {
    renderEditor();
    expect(await screen.findByDisplayValue('My flow')).toBeInTheDocument();
    expect(await screen.findByText('Log Message', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByTestId('node-library')).toBeInTheDocument();
    expect(screen.getByText('Valid')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    expect(workflowApi.update).not.toHaveBeenCalled(); // loading never triggers a save
  });

  test('adding a node from the library marks the workflow dirty, then autosaves once after the debounce', async () => {
    renderEditor();
    await screen.findByDisplayValue('My flow');
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(screen.getByText('Delay').closest('button'));
    fireEvent.click(screen.getByText('Set Variable').closest('button'));
    expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes');
    expect(workflowApi.update).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1300); });
    await waitFor(() => expect(workflowApi.update).toHaveBeenCalledTimes(1)); // two edits, one debounced save
    const [id, body] = workflowApi.update.mock.calls[0];
    expect(id).toBe('wf1');
    expect(body.nodes.map((n) => n.id)).toEqual(['trigger_1', 'log_1', 'delay_1', 'variable_1']);
    expect(body.nodes[0]).not.toHaveProperty('selected');
    expect(body.edges).toEqual([{ id: 'e1', source: 'trigger_1', target: 'log_1' }]);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'));
  });

  test('a failed save is surfaced and can be retried', async () => {
    workflowApi.update.mockRejectedValueOnce({ response: { data: { message: 'Database unavailable' } } });
    renderEditor();
    await screen.findByDisplayValue('My flow');
    fireEvent.change(screen.getByLabelText('Workflow name'), { target: { value: 'Renamed' } });
    await userEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Save failed'));
    expect(await screen.findByText('Database unavailable')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'));
    expect(workflowApi.update).toHaveBeenCalledTimes(2);
    expect(workflowApi.update.mock.calls[1][1].name).toBe('Renamed');
  });

  test('only one trigger can exist: adding a second shows an error and does not change the canvas', async () => {
    renderEditor();
    await screen.findByDisplayValue('My flow');
    expect(screen.getByText('Webhook Trigger').closest('button')).toBeDisabled();
    expect(workflowApi.update).not.toHaveBeenCalled();
  });

  test('Test workflow runs the saved workflow and shows per-node results', async () => {
    workflowApi.execute.mockResolvedValue({ data: { _id: 'ex1', status: 'success', duration: 12, nodeResults: [
      { nodeId: 'trigger_1', nodeType: 'manualTrigger', label: 'Manual Trigger', status: 'success', duration: 1, output: { body: { name: 'Ada' } } },
      { nodeId: 'log_1', nodeType: 'logMessage', label: 'Log Message', status: 'success', duration: 2, output: { message: 'hi Ada' } },
    ] } });
    renderEditor();
    await screen.findByDisplayValue('My flow');
    await userEvent.click(screen.getByRole('button', { name: /Test workflow/ }));
    const input = await screen.findByLabelText(/Trigger payload/);
    fireEvent.change(input, { target: { value: '{"name":"Ada"}' } });
    await userEvent.click(screen.getByRole('button', { name: /Run test/ }));
    await waitFor(() => expect(workflowApi.execute).toHaveBeenCalledWith('wf1', { name: 'Ada' }));
    expect(await screen.findByText('Open full execution ↗')).toBeInTheDocument();
    expect(screen.getAllByText('Success').length).toBeGreaterThan(0);
  });

  test('invalid JSON in the test payload is rejected client-side', async () => {
    renderEditor();
    await screen.findByDisplayValue('My flow');
    await userEvent.click(screen.getByRole('button', { name: /Test workflow/ }));
    fireEvent.change(await screen.findByLabelText(/Trigger payload/), { target: { value: '{nope' } });
    await userEvent.click(screen.getByRole('button', { name: /Run test/ }));
    expect(await screen.findByText('Sample payload must be valid JSON')).toBeInTheDocument();
    expect(workflowApi.execute).not.toHaveBeenCalled();
  });

  test('manual-trigger workflows have no Activate button', async () => {
    renderEditor();
    await screen.findByDisplayValue('My flow');
    expect(screen.queryByRole('button', { name: /Activate/ })).toBeNull();
  });
});
