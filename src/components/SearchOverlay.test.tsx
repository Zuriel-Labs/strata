import { createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchOverlay } from './SearchOverlay';
import { AppProvider, initialState, useAppState, useDispatch } from '../store';

function Controls() {
  const dispatch = useDispatch();
  const state = useAppState();
  return <>
    <button onClick={() => dispatch({ type: 'SET_SEARCH_OPEN', payload: true })}>Open search</button>
    <input aria-label="Draft" />
    <textarea aria-label="Description" />
    <select aria-label="Workspace"><option>Workspace</option></select>
    <div contentEditable suppressContentEditableWarning role="textbox" aria-label="Rich text"><span>Draft text</span></div>
    <output>{state.activeCardId ?? 'No active card'}</output>
    <SearchOverlay />
  </>;
}

function setup() {
  render(<AppProvider initialAppState={initialState}><Controls /></AppProvider>);
}

describe('search keyboard and focus', () => {
  it.each(['Draft', 'Description', 'Workspace', 'Rich text'])('preserves Ctrl+K inside %s', label => {
    setup();
    const target = screen.getByLabelText(label);
    target.focus();
    fireEvent.keyDown(target, { key: 'k', ctrlKey: true });
    expect(screen.queryByPlaceholderText(/Search cards/)).not.toBeInTheDocument();
    expect(target).toHaveFocus();
  });

  it('ignores composing and already-handled shortcuts', () => {
    setup();
    fireEvent.keyDown(window, { key: 'k', metaKey: true, isComposing: true });
    expect(screen.queryByPlaceholderText(/Search cards/)).not.toBeInTheDocument();
    const event = createEvent.keyDown(window, { key: 'k', ctrlKey: true });
    event.preventDefault();
    fireEvent(window, event);
    expect(screen.queryByPlaceholderText(/Search cards/)).not.toBeInTheDocument();
  });

  it.each(['ctrlKey', 'metaKey'])('opens a named modal with %s, traps focus and restores the trigger', async modifier => {
    const user = userEvent.setup();
    setup();
    const trigger = screen.getByRole('button', { name: 'Open search' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'k', [modifier]: true });
    const dialog = await screen.findByRole('dialog', { name: 'Search cards' });
    const input = within(dialog).getByRole('textbox', { name: 'Search cards' });
    await waitFor(() => expect(input).toHaveFocus());
    await user.tab({ shift: true });
    expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus();
    await user.tab();
    expect(input).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lets keyboard users choose a search result', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Open search' }));
    const card = initialState.cards.find(candidate => !candidate.archived);
    if (!card) throw new Error('Expected a searchable fixture card.');
    await user.type(screen.getByRole('textbox', { name: 'Search cards' }), card.title);
    await user.tab();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('status')).toHaveTextContent(card.id);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
