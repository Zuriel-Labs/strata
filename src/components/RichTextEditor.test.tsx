import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RichTextEditor } from './RichTextEditor';
import { plainTextToRichTextDocument } from '../lib/rich-text';

describe('RichTextEditor', () => {
  it('provides an accessible multiline editor and complete formatting toolbar', async () => {
    render(<RichTextEditor value={plainTextToRichTextDocument('Existing details')} onChange={vi.fn()} />);

    expect(await screen.findByRole('textbox', { name: 'Description editor' })).toHaveTextContent('Existing details');
    for (const name of ['Bold', 'Italic', 'Strikethrough', 'Inline code', 'Heading 2', 'Heading 3', 'Bulleted list', 'Numbered list', 'Quote', 'Code block', 'Link', 'Horizontal rule', 'Undo', 'Redo']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('emits a structured document as content changes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RichTextEditor value={plainTextToRichTextDocument('')} onChange={onChange} />);

    await user.click(await screen.findByRole('textbox', { name: 'Description editor' }));
    await user.type(screen.getByRole('textbox', { name: 'Description editor' }), 'Launch notes');

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
        type: 'doc',
        content: expect.arrayContaining([
          expect.objectContaining({
            type: 'paragraph',
            content: expect.arrayContaining([expect.objectContaining({ type: 'text', text: 'Launch notes' })]),
          }),
        ]),
      }));
    });
  });
});
