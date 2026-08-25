import { describe, expect, it } from 'vitest';
import {
  normalizeDescriptionInput,
  parseRichTextDocument,
  plainTextToRichTextDocument,
  richTextToPlainText,
  storedRichTextDocument,
} from './rich-text';

describe('rich-text document safety', () => {
  it('round-trips legacy multiline text including blank lines, unicode, and angle brackets', () => {
    const text = 'First\r\n\r\nThird – <not markup>\n';
    const document = plainTextToRichTextDocument(text);

    expect(richTextToPlainText(document)).toBe('First\n\nThird – <not markup>\n');
    expect(document.content).toHaveLength(4);
  });

  it('accepts and normalizes the supported document schema', () => {
    const parsed = parseRichTextDocument({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Heading', marks: [{ type: 'bold' }] }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Safe link', marks: [{ type: 'link', attrs: { href: 'https://example.com', target: '_blank', rel: 'noopener noreferrer', class: 'ignored' } }] }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item', marks: [{ type: 'italic' }, { type: 'strike' }, { type: 'code' }] }] }] }] },
        { type: 'codeBlock', content: [{ type: 'text', text: 'const ok = true;' }] },
        { type: 'horizontalRule' },
      ],
    });

    expect(parsed.content?.[1].content?.[0].marks?.[0].attrs).toEqual({
      href: 'https://example.com',
      target: '_blank',
      rel: 'noopener noreferrer',
    });
  });

  it.each([
    ['unsafe link', { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] }],
    ['unsupported node', { type: 'doc', content: [{ type: 'image', attrs: { src: 'x' } }] }],
    ['unsupported heading', { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 } }] }],
    ['non-document root', { type: 'paragraph' }],
    ['textless text node', { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text' }] }] }],
  ])('rejects %s', (_name, input) => {
    expect(() => parseRichTextDocument(input)).toThrow(/description/i);
  });

  it('rejects documents beyond the depth, node, text, and encoded-size limits', () => {
    let deep: Record<string, unknown> = { type: 'paragraph' };
    for (let index = 0; index < 13; index += 1) deep = { type: 'blockquote', content: [deep] };

    expect(() => parseRichTextDocument({ type: 'doc', content: [deep] })).toThrow(/description/i);
    expect(() => parseRichTextDocument({ type: 'doc', content: Array.from({ length: 5_001 }, () => ({ type: 'paragraph' })) })).toThrow(/description/i);
    expect(() => parseRichTextDocument({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(50_001) }] }] })).toThrow(/description/i);
    expect(() => parseRichTextDocument({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '🙂'.repeat(30_000) }] }] })).toThrow(/description/i);
  });

  it('uses safe legacy text when stored JSON is malformed or unsupported', () => {
    expect(storedRichTextDocument('{broken', 'fallback')).toEqual(plainTextToRichTextDocument('fallback'));
    expect(storedRichTextDocument(JSON.stringify({ type: 'doc', content: [{ type: 'image' }] }), 'fallback')).toEqual(plainTextToRichTextDocument('fallback'));
  });

  it('normalizes either legacy or structured updates and rejects ambiguous dual inputs', () => {
    expect(normalizeDescriptionInput({ description: 'legacy' })).toEqual({
      description: 'legacy',
      descriptionDocument: plainTextToRichTextDocument('legacy'),
    });

    const document = plainTextToRichTextDocument('structured');
    expect(normalizeDescriptionInput({ descriptionDocument: document })).toEqual({
      description: 'structured',
      descriptionDocument: document,
    });
    expect(() => normalizeDescriptionInput({ description: 'legacy', descriptionDocument: document })).toThrow(/either/i);
  });
});
