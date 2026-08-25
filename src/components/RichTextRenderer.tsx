import { Fragment, type ReactNode } from 'react';
import type { RichTextDocument, RichTextMark, RichTextNode } from '../types';

interface RichTextRendererProps {
  document: RichTextDocument;
  className?: string;
}

function applyMark(content: ReactNode, mark: RichTextMark, key: number) {
  switch (mark.type) {
    case 'bold':
      return <strong key={key}>{content}</strong>;
    case 'italic':
      return <em key={key}>{content}</em>;
    case 'strike':
      return <s key={key}>{content}</s>;
    case 'code':
      return <code key={key}>{content}</code>;
    case 'link':
      return (
        <a key={key} href={mark.attrs?.href} target="_blank" rel="noopener noreferrer">
          {content}
        </a>
      );
  }
}

function renderChildren(node: RichTextNode) {
  return node.content?.map((child, index) => renderNode(child, index)) ?? null;
}

function renderNode(node: RichTextNode, key: number): ReactNode {
  if (node.type === 'text') {
    return (node.marks ?? []).reduce<ReactNode>(
      (content, mark, markIndex) => applyMark(content, mark, markIndex),
      node.text ?? '',
    );
  }

  const children = renderChildren(node);
  switch (node.type) {
    case 'doc':
      return <Fragment key={key}>{children}</Fragment>;
    case 'paragraph':
      return <p key={key} className="my-2 first:mt-0 last:mb-0 whitespace-pre-wrap">{children}</p>;
    case 'heading':
      return node.attrs?.level === 3
        ? <h3 key={key} className="mb-2 mt-4 text-base font-bold first:mt-0">{children}</h3>
        : <h2 key={key} className="mb-2 mt-4 text-xl font-bold first:mt-0">{children}</h2>;
    case 'bulletList':
      return <ul key={key} className="my-2 list-disc space-y-1 pl-6">{children}</ul>;
    case 'orderedList':
      return <ol key={key} start={node.attrs?.start} className="my-2 list-decimal space-y-1 pl-6">{children}</ol>;
    case 'listItem':
      return <li key={key}>{children}</li>;
    case 'blockquote':
      return <blockquote key={key} className="my-3 border-l-4 pl-4 italic" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>{children}</blockquote>;
    case 'codeBlock':
      return <pre key={key} className="my-3 overflow-x-auto rounded-lg p-3 text-xs" style={{ background: 'rgba(0,0,0,0.28)' }}><code>{children}</code></pre>;
    case 'horizontalRule':
      return <hr key={key} className="my-4 border-0 border-t" style={{ borderColor: 'var(--border)' }} />;
    case 'hardBreak':
      return <br key={key} />;
  }
}

export function RichTextRenderer({ document, className }: RichTextRendererProps) {
  return (
    <div className={`rich-text-content break-words leading-6 ${className ?? ''}`} data-testid="rich-text-description">
      {renderChildren(document)}
    </div>
  );
}
