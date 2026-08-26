import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LabelEditor } from './LabelEditor';
import { ApiError } from '../services/api';

const labels = [
  { id: 'lb1', name: 'Urgent', color: '#ef4444' },
  { id: 'lb2', name: 'Feature', color: '#a855f7' },
];

describe('LabelEditor', () => {
  it('gives a sixth label a fresh identity after a persisted client ID is reloaded', async () => {
    const user = userEvent.setup();
    const persisted = [
      { id: 'lb1', name: 'Website', color: '#8b5cf6' },
      { id: 'lb2', name: 'Mobile App', color: '#f97316' },
      { id: 'id_101', name: 'Persisted third label', color: '#ef4444' },
      { id: 'lb4', name: 'Worship Planning', color: '#f59e0b' },
      { id: 'lb5', name: 'Communication', color: '#84cc16' },
    ];
    const onSave = vi.fn();
    render(<LabelEditor labels={persisted} onSave={onSave} onCancel={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Add new label' }));
    const sixthInput = screen.getAllByPlaceholderText('Label name').at(-1)!;
    await user.type(sixthInput, 'Independent sixth label');
    await user.click(screen.getByLabelText('Choose color for Independent sixth label'));
    await user.click(screen.getByLabelText('Select #3b82f6'));
    await user.click(screen.getByRole('button', { name: 'Save labels' }));

    expect(screen.getByDisplayValue('Persisted third label')).toBeInTheDocument();
    expect(onSave).toHaveBeenCalledWith([
      ...persisted,
      expect.objectContaining({
        id: expect.not.stringMatching(/^id_101$/),
        name: 'Independent sixth label',
        color: '#3b82f6',
      }),
    ]);
  });

  it('stages create, rename, and recolor changes until Save', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async (nextLabels: typeof labels) => { void nextLabels; });
    render(<LabelEditor labels={labels} onSave={onSave} onCancel={vi.fn()} />);

    await user.clear(screen.getByDisplayValue('Urgent'));
    await user.type(screen.getAllByPlaceholderText('Label name')[0], 'Critical');
    await user.click(screen.getByLabelText('Choose color for Critical'));
    await user.click(screen.getByLabelText('Select #3b82f6'));
    await user.click(screen.getByRole('button', { name: 'Add new label' }));

    expect(onSave).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Save labels' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.lastCall?.[0]).toEqual([
      { id: 'lb1', name: 'Critical', color: '#3b82f6' },
      labels[1],
      expect.objectContaining({ name: '', color: expect.stringMatching(/^#[0-9a-f]{6}$/) }),
    ]);
  });

  it('requires deletion confirmation and explains board-wide impact', async () => {
    const user = userEvent.setup();
    render(<LabelEditor labels={labels} onSave={vi.fn()} onCancel={vi.fn()} usageCount={labelId => labelId === 'lb2' ? 3 : 0} />);

    await user.click(screen.getByRole('button', { name: 'Delete Feature' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/3 cards/i);
    expect(screen.getByDisplayValue('Feature')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirm delete label' }));
    expect(screen.queryByDisplayValue('Feature')).not.toBeInTheDocument();
  });

  it('supports Cancel without saving and keeps a recoverable draft after failure', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onSave = vi.fn(async () => { throw new Error('Save unavailable'); });
    render(<LabelEditor labels={labels} onSave={onSave} onCancel={onCancel} />);

    await user.clear(screen.getByDisplayValue('Urgent'));
    await user.type(screen.getAllByPlaceholderText('Label name')[0], 'Draft');
    await user.click(screen.getByRole('button', { name: 'Save labels' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Save unavailable');
    expect(screen.getByDisplayValue('Draft')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel label changes' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue('Urgent')).toBeInTheDocument();
  });

  it('preserves an unsaved new label when equivalent authoritative labels rerender', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<LabelEditor labels={labels} onSave={vi.fn()} onCancel={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Add new label' }));
    const newLabel = screen.getAllByPlaceholderText('Label name').at(-1)!;
    await user.type(newLabel, 'Do not disappear');

    rerender(<LabelEditor labels={labels.map(label => ({ ...label }))} onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByDisplayValue('Do not disappear')).toBeInTheDocument();
  });

  it('shows the configured count, blocks only Add at the limit, and keeps existing label controls operable', async () => {
    const user = userEvent.setup();
    const atLimit = Array.from({ length: 12 }, (_, index) => ({ id: `limit-${index}`, name: `Label ${index + 1}`, color: '#3b82f6' }));
    const onSave = vi.fn();
    render(<LabelEditor labels={atLimit} maxLabelsPerBoard={12} onSave={onSave} onCancel={vi.fn()} />);

    expect(screen.getByText(/12 of 12 labels used/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add new label' })).toBeDisabled();
    const lastInput = screen.getByDisplayValue('Label 12');
    await user.clear(lastInput); await user.type(lastInput, 'Still editable');
    await user.click(screen.getByLabelText('Choose color for Still editable'));
    await user.click(screen.getByLabelText('Select #ec4899'));
    await user.click(screen.getByRole('button', { name: 'Save labels' }));
    expect(onSave).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'limit-11', name: 'Still editable', color: '#ec4899' })]));
  });

  it('supports configured limits above 12 with deterministic palette reuse', async () => {
    const user = userEvent.setup(); const onSave = vi.fn();
    const twelve = Array.from({ length: 12 }, (_, index) => ({ id: `high-${index}`, name: `High ${index}`, color: '#3b82f6' }));
    render(<LabelEditor labels={twelve} maxLabelsPerBoard={20} onSave={onSave} onCancel={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Add new label' }));
    expect(screen.getByText(/13 of 20 labels used/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save labels' }));
    expect(onSave.mock.lastCall?.[0]).toHaveLength(13);
    expect(onSave.mock.lastCall?.[0][12].color).toBe('#ef4444');
  });

  it('preserves a stale draft, blocks blind retry, and offers an authoritative reload', async () => {
    const user = userEvent.setup(); const onReload = vi.fn();
    const onSave = vi.fn(async () => { throw new ApiError(409, 'Labels changed in another editor.', 'LABEL_VERSION_CONFLICT', { labelsRevision: 2 }); });
    render(<LabelEditor labels={labels} onSave={onSave} onCancel={vi.fn()} onReload={onReload} />);
    await user.clear(screen.getByDisplayValue('Urgent')); await user.type(screen.getAllByPlaceholderText('Label name')[0], 'Unsaved conflict draft');
    await user.click(screen.getByRole('button', { name: 'Save labels' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Labels changed in another editor.');
    expect(screen.getByDisplayValue('Unsaved conflict draft')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save labels' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Reload current labels' }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
