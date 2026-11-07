import { describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog, StatusBadge, EmptyState } from '../components/common/ui';
import NodeConfigPanel from '../components/workflow/NodeConfigPanel';
import NodeLibrary from '../components/workflow/NodeLibrary';
import { formatDuration, timeAgo } from '../utils/format';

describe('common components', () => {
  test('StatusBadge renders a capitalised label', () => {
    render(<StatusBadge status="success" />);
    expect(screen.getByText('Success')).toBeInTheDocument();
  });
  test('ConfirmDialog: confirm and cancel callbacks, closed state renders nothing', async () => {
    const onConfirm = vi.fn(); const onCancel = vi.fn();
    const { rerender } = render(<ConfirmDialog open={false} title="Delete" message="sure?" onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(<ConfirmDialog open title="Delete workflow" message="sure?" confirmLabel="Delete it" danger onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.getByRole('dialog', { name: 'Delete workflow' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete it' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
  test('ConfirmDialog closes on Escape', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="t" message="m" onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });
  test('EmptyState shows title, description and action', () => {
    render(<EmptyState title="Nothing here" description="Add one" action={<button>Add</button>} />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });
  test('format helpers', () => {
    expect(formatDuration(250)).toBe('250 ms');
    expect(formatDuration(2500)).toBe('2.50 s');
    expect(formatDuration(undefined)).toBe('—');
    const now = new Date('2026-01-01T12:00:00Z').getTime();
    expect(timeAgo('2026-01-01T11:00:00Z', now)).toBe('1h ago');
    expect(timeAgo(null)).toBe('Never');
  });
});

const node = (type, config) => ({ id: `${type}_1`, type, data: { label: 'Test node', config } });
const setup = (type, config, props = {}) => {
  const handlers = { onLabel: vi.fn(), onConfig: vi.fn(), onDelete: vi.fn(), onDuplicate: vi.fn(), onClose: vi.fn() };
  render(<NodeConfigPanel node={node(type, config)} upstream={['trigger_1']} integrations={[{ id: 'i1', name: 'Billing' }]} webhookUrl="http://x/api/webhooks/abc" {...handlers} {...props} />);
  return handlers;
};

describe('NodeConfigPanel', () => {
  test('condition: operator list, value input hidden for "exists", change emits full config', async () => {
    const h = setup('condition', { field: '{{trigger.body.email}}', operator: 'equals', value: 'x' });
    expect(screen.getByLabelText('Comparison value')).toBeInTheDocument();
    const ops = screen.getByLabelText('Operator');
    expect([...ops.options].map((o) => o.value)).toEqual(['equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than', 'exists', 'is_empty']);
    fireEvent.change(ops, { target: { value: 'contains' } });
    expect(h.onConfig).toHaveBeenLastCalledWith({ field: '{{trigger.body.email}}', operator: 'contains', value: 'x' });
  });
  test('condition: no value field for exists / is_empty', () => {
    setup('condition', { field: 'a', operator: 'exists' });
    expect(screen.queryByLabelText('Comparison value')).toBeNull();
  });
  test('http request: edits, header rows and integration picker', async () => {
    const h = setup('httpRequest', { method: 'GET', url: '', headers: [], queryParams: [] });
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'https://api.test' } });
    expect(h.onConfig).toHaveBeenLastCalledWith(expect.objectContaining({ url: 'https://api.test' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add headers' }));
    expect(h.onConfig).toHaveBeenLastCalledWith(expect.objectContaining({ headers: [{ key: '', value: '' }] }));
    const methods = [...screen.getByLabelText('Method').options].map((o) => o.value);
    expect(methods).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
    expect(screen.getByRole('option', { name: 'Billing' })).toBeInTheDocument();
  });
  test('webhook trigger shows its URL; schedule trigger switches fields by mode', () => {
    setup('webhookTrigger', {});
    expect(screen.getByLabelText('Webhook URL')).toHaveValue('http://x/api/webhooks/abc');
  });
  test('schedule: custom mode shows the cron input', () => {
    setup('scheduleTrigger', { mode: 'custom', cron: '*/5 * * * *' });
    expect(screen.getByLabelText('Cron expression')).toHaveValue('*/5 * * * *');
    expect(screen.queryByLabelText(/Minute/)).toBeNull();
  });
  test('shows validation errors, label edits and delete', async () => {
    const h = setup('logMessage', {}, { errors: ['Message is required'] });
    expect(screen.getByRole('alert')).toHaveTextContent('Message is required');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed' } });
    expect(h.onLabel).toHaveBeenCalledWith('Renamed');
    await userEvent.click(screen.getByRole('button', { name: /Delete/ }));
    expect(h.onDelete).toHaveBeenCalled();
  });
  test('delay input is bounded', () => {
    setup('delay', { seconds: 2 });
    const input = screen.getByLabelText(/Delay/);
    expect(input).toHaveAttribute('max', '30');
    expect(input).toHaveAttribute('min', '0');
  });
  test('triggers cannot be duplicated', () => {
    setup('manualTrigger', {});
    expect(screen.queryByRole('button', { name: /Duplicate/ })).toBeNull();
  });
});

describe('NodeLibrary', () => {
  test('lists all eight nodes in three categories and adds on click', async () => {
    const onAdd = vi.fn();
    render(<NodeLibrary onAdd={onAdd} hasTrigger={false} />);
    ['Manual Trigger', 'Webhook Trigger', 'Schedule Trigger', 'Condition', 'HTTP Request', 'Delay', 'Set Variable', 'Log Message'].forEach((t) => expect(screen.getByText(t)).toBeInTheDocument());
    ['Triggers', 'Logic', 'Actions'].forEach((c) => expect(screen.getByRole('region', { name: c })).toBeInTheDocument());
    await userEvent.click(screen.getByText('Condition'));
    expect(onAdd).toHaveBeenCalledWith('condition');
  });
  test('trigger entries are disabled once a trigger exists; actions stay enabled', () => {
    render(<NodeLibrary onAdd={() => {}} hasTrigger />);
    expect(screen.getByText('Webhook Trigger').closest('button')).toBeDisabled();
    expect(screen.getByText('HTTP Request').closest('button')).not.toBeDisabled();
  });
  test('items are draggable and set the drag payload', () => {
    render(<NodeLibrary onAdd={() => {}} hasTrigger={false} />);
    const btn = screen.getByText('Delay').closest('button');
    expect(btn).toHaveAttribute('draggable', 'true');
    const setData = vi.fn();
    fireEvent.dragStart(btn, { dataTransfer: { setData, effectAllowed: '' } });
    expect(setData).toHaveBeenCalledWith('application/autoloom-node', 'delay');
  });
});
