import { render, screen } from '@testing-library/react';
import { RichTextRenderer } from './RichTextRenderer';
import type { RichTextDocument } from '../types';

describe('RichTextRenderer', () => {
  it('renders the supported rich-text structure with semantic elements', () => {
    const document: RichTextDocument = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Release plan', marks: [{ type: 'bold' }] }] },
        { type: 'paragraph', content: [
          { type: 'text', text: 'Read ' },
          { type: 'text', text: 'the brief', marks: [{ type: 'link', attrs: { href: 'https://example.com/brief' } }, { type: 'italic' }] },
          { type: 'hardBreak' },
          { type: 'text', text: 'before launch', marks: [{ type: 'strike' }] },
        ] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Verify canary' }] }] }] },
        { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Approve release' }] }] }] },
        { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ship safely' }] }] },
        { type: 'codeBlock', content: [{ type: 'text', text: 'npm run test', marks: [{ type: 'code' }] }] },
        { type: 'horizontalRule' },
      ],
    };

    const { container } = render(<RichTextRenderer document={document} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Release plan' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'the brief' })).toHaveAttribute('href', 'https://example.com/brief');
    expect(screen.getByRole('link', { name: 'the brief' })).toHaveAttribute('rel', 'noopener noreferrer');
    expect(container.querySelector('ul')).toHaveTextContent('Verify canary');
    expect(container.querySelector('ol')).toHaveTextContent('Approve release');
    expect(container.querySelector('blockquote')).toHaveTextContent('Ship safely');
    expect(container.querySelector('pre')).toHaveTextContent('npm run test');
    expect(container.querySelector('hr')).toBeInTheDocument();
  });

  it('renders text as text rather than interpreting embedded markup', () => {
    const document: RichTextDocument = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '<img src=x onerror=alert(1)>' }] }],
    };

    const { container } = render(<RichTextRenderer document={document} />);

    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
  });
});
