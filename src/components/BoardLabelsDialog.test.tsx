import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoardLabelsDialog } from './BoardLabelsDialog';

describe('BoardLabelsDialog', () => {
  it('persists label edits immediately', async () => {
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

    expect(onSave).toHaveBeenLastCalledWith([
      { id: 'lb1', name: 'Critical', color: '#ef4444' },
    ]);
  });

  it('adds a new empty label immediately from the inline row control', async () => {
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

    await user.click(screen.getByRole('button', { name: 'Add New Label' }));

    expect(onSave).toHaveBeenCalled();
    expect(onSave.mock.lastCall?.[0]).toEqual([
      { id: 'lb1', name: 'Urgent', color: '#ef4444' },
      expect.objectContaining({ name: '' }),
    ]);
    expect(onSave.mock.lastCall?.[0][1].color).not.toBe('#ef4444');
  });

  it('saves on close and applies colors immediately from the palette', async () => {
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

    expect(onSave).toHaveBeenLastCalledWith([{ id: 'lb1', name: 'Urgent', color: '#3b82f6' }]);

    await user.click(screen.getByLabelText('Close label manager'));

    expect(onSave).toHaveBeenLastCalledWith([{ id: 'lb1', name: 'Urgent', color: '#3b82f6' }]);
    expect(onClose).toHaveBeenCalled();
  });

  it('removes labels immediately with the trash button', async () => {
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

    await user.click(screen.getByRole('button', { name: 'Remove Feature' }));

    expect(onSave).toHaveBeenLastCalledWith([{ id: 'lb1', name: 'Urgent', color: '#ef4444' }]);
  });
});
