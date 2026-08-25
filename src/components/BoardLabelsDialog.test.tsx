import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoardLabelsDialog } from './BoardLabelsDialog';

describe('BoardLabelsDialog', () => {
  it('stages label edits and persists them on Save', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <BoardLabelsDialog
        open
        labels={[{ id: 'lb1', name: 'Urgent', color: '#ef4444' }]}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.clear(screen.getByDisplayValue('Urgent'));
    await user.type(screen.getByPlaceholderText('Label name'), 'Critical');

    expect(onSave).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Save labels' }));
    expect(onSave).toHaveBeenLastCalledWith([
      { id: 'lb1', name: 'Critical', color: '#ef4444' },
    ]);
  });

  it('adds a new empty label to the staged aggregate', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <BoardLabelsDialog
        open
        labels={[{ id: 'lb1', name: 'Urgent', color: '#ef4444' }]}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Add new label' }));

    expect(onSave).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Save labels' }));
    expect(onSave.mock.lastCall?.[0]).toEqual([
      { id: 'lb1', name: 'Urgent', color: '#ef4444' },
      expect.objectContaining({ name: '' }),
    ]);
    expect(onSave.mock.lastCall?.[0][1].color).not.toBe('#ef4444');
  });

  it('discards a staged color change when closed', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <BoardLabelsDialog
        open
        labels={[{ id: 'lb1', name: 'Urgent', color: '#ef4444' }]}
        onClose={onClose}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByLabelText('Choose color for Urgent'));
    await user.click(screen.getByLabelText('Select #3b82f6'));

    await user.click(screen.getByLabelText('Close label manager'));

    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('confirms label removal and persists it on Save', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <BoardLabelsDialog
        open
        labels={[
          { id: 'lb1', name: 'Urgent', color: '#ef4444' },
          { id: 'lb2', name: 'Feature', color: '#a855f7' },
        ]}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Delete Feature' }));
    await user.click(screen.getByRole('button', { name: 'Confirm delete label' }));
    expect(onSave).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Save labels' }));

    expect(onSave).toHaveBeenLastCalledWith([{ id: 'lb1', name: 'Urgent', color: '#ef4444' }]);
  });
});
