import type { RichTextDocument, RichTextMark, RichTextMarkType, RichTextNode, RichTextNodeType } from '../types';

export const RICH_TEXT_LIMITS = {
  maxBytes: 100_000,
  maxNodes: 5_000,
  maxDepth: 12,
  maxTextCharacters: 50_000,
} as const;

export const RICH_TEXT_NODE_TYPES = new Set<RichTextNodeType>([
  'doc',
  'paragraph',
  'text',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
  'hardBreak',
  'horizontalRule',
]);

export const RICH_TEXT_MARK_TYPES = new Set<RichTextMarkType>([
  'bold',
  'italic',
  'strike',
  'code',
  'link',
]);

export const EMPTY_RICH_TEXT_DOCUMENT: RichTextDocument = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

export class RichTextValidationError extends Error {
  constructor(message = 'Invalid card description.') {
    super(message);
    this.name = 'RichTextValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidDescription(): never {
  throw new RichTextValidationError();
}

function normalizeLink(hrefValue: unknown, attrs: Record<string, unknown>): RichTextMark['attrs'] {
  if (typeof hrefValue !== 'string' || hrefValue.length === 0 || hrefValue.length > 2_048) {
    return invalidDescription();
  }

  const href = hrefValue.trim();
  let protocol: string;
  try {
    protocol = new URL(href).protocol.toLowerCase();
  } catch {
    return invalidDescription();
  }
  if (!['http:', 'https:', 'mailto:'].includes(protocol)) return invalidDescription();

  const target = attrs.target === '_blank' ? '_blank' : undefined;
  const rel = target ? 'noopener noreferrer' : undefined;
  return { href, ...(target ? { target, rel } : {}) };
}

interface ParseCounters {
  nodes: number;
  textCharacters: number;
}

function parseMarks(value: unknown): RichTextMark[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return invalidDescription();

  return value.map(markValue => {
    if (!isRecord(markValue) || typeof markValue.type !== 'string' || !RICH_TEXT_MARK_TYPES.has(markValue.type as RichTextMarkType)) {
      return invalidDescription();
    }
    const type = markValue.type as RichTextMarkType;
    if (type !== 'link') return { type };
    if (!isRecord(markValue.attrs)) return invalidDescription();
    return { type, attrs: normalizeLink(markValue.attrs.href, markValue.attrs) };
  });
}

function parseNode(value: unknown, depth: number, counters: ParseCounters, root: boolean): RichTextNode {
  if (!isRecord(value) || depth > RICH_TEXT_LIMITS.maxDepth || typeof value.type !== 'string' || !RICH_TEXT_NODE_TYPES.has(value.type as RichTextNodeType)) {
    return invalidDescription();
  }

  const type = value.type as RichTextNodeType;
  if ((root && type !== 'doc') || (!root && type === 'doc')) return invalidDescription();
  counters.nodes += 1;
  if (counters.nodes > RICH_TEXT_LIMITS.maxNodes) return invalidDescription();

  if (type === 'text') {
    if (typeof value.text !== 'string' || value.content !== undefined || value.attrs !== undefined) return invalidDescription();
    counters.textCharacters += value.text.length;
    if (counters.textCharacters > RICH_TEXT_LIMITS.maxTextCharacters) return invalidDescription();
    const marks = parseMarks(value.marks);
    return { type, text: value.text, ...(marks?.length ? { marks } : {}) };
  }

  if (value.text !== undefined || value.marks !== undefined) return invalidDescription();
  let attrs: RichTextNode['attrs'];
  if (type === 'heading') {
    if (!isRecord(value.attrs) || (value.attrs.level !== 2 && value.attrs.level !== 3)) return invalidDescription();
    attrs = { level: value.attrs.level };
  } else if (type === 'orderedList' && value.attrs !== undefined) {
    if (!isRecord(value.attrs) || (value.attrs.start !== undefined && (!Number.isInteger(value.attrs.start) || Number(value.attrs.start) < 1))) {
      return invalidDescription();
    }
    if (value.attrs.start !== undefined) attrs = { start: Number(value.attrs.start) };
  }

  let content: RichTextNode[] | undefined;
  if (value.content !== undefined) {
    if (!Array.isArray(value.content)) return invalidDescription();
    content = value.content.map(child => parseNode(child, depth + 1, counters, false));
  }

  return {
    type,
    ...(attrs ? { attrs } : {}),
    ...(content?.length ? { content } : {}),
  };
}

export function parseRichTextDocument(value: unknown): RichTextDocument {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return invalidDescription();
  }
  if (new TextEncoder().encode(serialized).byteLength > RICH_TEXT_LIMITS.maxBytes) return invalidDescription();
  return parseNode(value, 0, { nodes: 0, textCharacters: 0 }, true) as RichTextDocument;
}

export function plainTextToRichTextDocument(value: string): RichTextDocument {
  const normalized = value.replace(/\r\n?/g, '\n');
  return {
    type: 'doc',
    content: normalized.split('\n').map(line => ({
      type: 'paragraph',
      ...(line.length > 0 ? { content: [{ type: 'text', text: line }] } : {}),
    })),
  };
}

function inlineText(node: RichTextNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  return (node.content ?? []).map(inlineText).join('');
}

function blockText(node: RichTextNode): string {
  if (node.type === 'bulletList' || node.type === 'orderedList') {
    return (node.content ?? []).map(blockText).join('\n');
  }
  if (node.type === 'listItem') {
    return (node.content ?? []).map(child => child.type === 'bulletList' || child.type === 'orderedList' ? blockText(child) : inlineText(child)).join('\n');
  }
  if (node.type === 'horizontalRule') return '---';
  return inlineText(node);
}

export function richTextToPlainText(document: RichTextDocument): string {
  return (document.content ?? []).map(blockText).join('\n');
}

export function storedRichTextDocument(serialized: unknown, legacyText: string): RichTextDocument {
  if (typeof serialized !== 'string' || serialized.length === 0) return plainTextToRichTextDocument(legacyText);
  try {
    return parseRichTextDocument(JSON.parse(serialized) as unknown);
  } catch {
    return plainTextToRichTextDocument(legacyText);
  }
}

export function normalizeDescriptionInput(input: { description?: unknown; descriptionDocument?: unknown }) {
  const hasLegacy = input.description !== undefined;
  const hasStructured = input.descriptionDocument !== undefined;
  if (hasLegacy && hasStructured) throw new RichTextValidationError('Submit either description or descriptionDocument, not both.');
  if (!hasLegacy && !hasStructured) return null;

  const descriptionDocument = hasStructured
    ? parseRichTextDocument(input.descriptionDocument)
    : plainTextToRichTextDocument(typeof input.description === 'string' ? input.description : invalidDescription());
  return {
    description: richTextToPlainText(descriptionDocument),
    descriptionDocument,
  };
}
