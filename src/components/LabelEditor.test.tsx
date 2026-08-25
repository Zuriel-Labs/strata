import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LabelEditor } from './LabelEditor';

const labels = [
  { id: 'lb1', name: 'Urgent', color: '#ef4444' },
  { id: 'lb2', name: 'Feature', color: '#a855f7' },
];

describe('LabelEditor', () => {
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
});
