import { useEffect, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import type { RichTextDocument } from '../types';
import { parseRichTextDocument } from '../lib/rich-text';

interface RichTextEditorProps {
  value: RichTextDocument;
  onChange: (document: RichTextDocument) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

interface ToolbarButtonProps {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: string;
}

function ToolbarButton({ label, active = false, disabled = false, onClick, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className="min-h-[40px] min-w-[40px] rounded-md border px-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        background: active ? 'var(--active-bg)' : 'transparent',
        borderColor: active ? 'var(--accent)' : 'var(--border)',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
      }}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({ value, onChange, disabled = false, autoFocus = false }: RichTextEditorProps) {
  const [, setToolbarVersion] = useState(0);
  const [linkEditing, setLinkEditing] = useState(false);
  const [linkHref, setLinkHref] = useState('');
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        protocols: ['http', 'https', 'mailto'],
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
    ],
    content: value,
    editable: !disabled,
    autofocus: autoFocus ? 'end' : false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-label': 'Description editor',
        'aria-multiline': 'true',
        class: 'rich-text-content min-h-[160px] px-4 py-3 text-sm leading-6 outline-none',
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange(parseRichTextDocument(currentEditor.getJSON()));
      setToolbarVersion(version => version + 1);
    },
    onSelectionUpdate: () => setToolbarVersion(version => version + 1),
  });

  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const current = JSON.stringify(editor.getJSON());
    const incoming = JSON.stringify(value);
    if (current !== incoming) editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  if (!editor) return <div aria-label="Loading description editor" className="min-h-[208px]" />;

  const run = (command: () => boolean) => {
    if (!disabled) command();
  };
  const currentLink = String(editor.getAttributes('link').href ?? '');
  const applyLink = () => {
    const href = linkHref.trim();
    if (!href) return;
    run(() => editor.chain().focus().extendMarkRange('link').setLink({ href }).run());
    setLinkEditing(false);
  };

  return (
    <div className="overflow-hidden rounded-xl border" style={{ background: 'var(--input-bg)', borderColor: 'var(--border)' }}>
      <div className="flex flex-wrap gap-1 border-b p-2" role="toolbar" aria-label="Description formatting" style={{ borderColor: 'var(--border)' }}>
        <ToolbarButton label="Bold" active={editor.isActive('bold')} disabled={disabled} onClick={() => run(() => editor.chain().focus().toggleBold().run())}>B</ToolbarButton>
        <ToolbarButton label="Italic" active={editor.isActive('italic')} disabled={disabled} onClick={() => run(() => editor.chain().focus().toggleItalic().run())}>I</ToolbarButton>
        <ToolbarButton label="Strikethrough" active={editor.isActive('strike')} disabled={disabled} onClick={() => run(() => editor.chain().focus().toggleStrike().run())}>S</ToolbarButton>
        <ToolbarButton label="Inline code" active={editor.isActive('code')} disabled={disabled} onClick={() => run(() => editor.chain().focus().toggleCode().run())}>{'</>'}</ToolbarButton>
        <ToolbarButton label="Heading 2" active={editor.isActive('heading', { level: 2 })} disabled={disabled} onClick={() => run(() => editor.chain().focus().toggleHeading({ level: 2 }).run())}>H2</ToolbarButton>
        <ToolbarButton label="Heading 3" active={editor.isActive('heading', { level: 3 })} disabled={disabled} onClick={() => run(() => editor.chain().focus().toggleHeading({ level: 3 }).run())}>H3</ToolbarButton>
        <ToolbarButton label="Bulleted list" active={editor.isActive('bulletList')} disabled={disabled} onClick={() => run(() => editor.chain().focus().toggleBulletList().run())}>• List</ToolbarButton>
        <ToolbarButton label="Numbered list" active={editor.isActive('orderedList')} disabled={disabled} onClick={() => run(() => editor.chain().focus().toggleOrderedList().run())}>1. List</ToolbarButton>
        <ToolbarButton label="Quote" active={editor.isActive('blockquote')} disabled={disabled} onClick={() => run(() => editor.chain().focus().toggleBlockquote().run())}>Quote</ToolbarButton>
        <ToolbarButton label="Code block" active={editor.isActive('codeBlock')} disabled={disabled} onClick={() => run(() => editor.chain().focus().toggleCodeBlock().run())}>Code</ToolbarButton>
        <ToolbarButton
          label="Link"
          active={editor.isActive('link')}
          disabled={disabled}
          onClick={() => {
            setLinkHref(currentLink);
            setLinkEditing(current => !current);
          }}
        >Link</ToolbarButton>
        <ToolbarButton label="Horizontal rule" disabled={disabled} onClick={() => run(() => editor.chain().focus().setHorizontalRule().run())}>—</ToolbarButton>
      </div>
      {linkEditing && (
        <div className="flex flex-wrap items-center gap-2 border-b p-2" style={{ borderColor: 'var(--border)' }}>
          <input
            autoFocus
            type="url"
            aria-label="Link URL"
            value={linkHref}
            onChange={event => setLinkHref(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') applyLink();
              if (event.key === 'Escape') setLinkEditing(false);
            }}
            placeholder="https://example.com"
            className="min-h-[40px] min-w-0 flex-1 rounded-md border px-3 text-sm outline-none"
            style={{ background: 'transparent', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
          <button type="button" onClick={applyLink} className="min-h-[40px] rounded-md px-3 text-sm text-white" style={{ background: 'var(--accent)' }}>Apply</button>
          {editor.isActive('link') && (
            <button
              type="button"
              onClick={() => {
                run(() => editor.chain().focus().unsetLink().run());
                setLinkEditing(false);
              }}
              className="min-h-[40px] px-2 text-sm"
              style={{ color: 'var(--text-secondary)' }}
            >Remove</button>
          )}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
