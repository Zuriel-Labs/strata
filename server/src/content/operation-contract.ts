import { z } from 'zod';

const id = z.string().trim().min(1).max(200);
const mapping = z.array(z.object({ sourceId: id, destinationId: id.nullable() }).strict()).max(1000).superRefine((entries, context) => {
  if (new Set(entries.map(entry => entry.sourceId)).size !== entries.length) context.addIssue({ code: 'custom', message: 'Duplicate source mappings.' });
});
export const operationSchema = z.object({
  kind: z.enum(['board_copy', 'board_move', 'list_copy', 'list_move', 'card_copy', 'card_move', 'delete']),
  sourceId: id,
  resourceType: z.enum(['workspace', 'board', 'list', 'card']).optional(),
  destinationWorkspaceId: id.optional(), destinationBoardId: id.optional(), destinationListId: id.optional(),
  position: z.number().int().min(0).max(1_000_000).default(1_000_000),
  title: z.string().trim().min(1).max(200).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  isTemplate: z.boolean().default(false),
  keep: z.object({
    cards: z.boolean().default(true), descriptions: z.boolean().default(true),
    checklists: z.boolean().default(true), checklistCompletion: z.boolean().default(false),
    labels: z.boolean().default(true), dueDates: z.boolean().default(false),
    dueCompletion: z.boolean().default(false), attachments: z.boolean().default(false),
  }).strict().default({ cards: true, descriptions: true, checklists: true, checklistCompletion: false, labels: true, dueDates: false, dueCompletion: false, attachments: false }),
  labelMap: mapping.default([]), memberMap: mapping.default([]), fieldMap: mapping.default([]),
}).strict();

export const commitSchema = operationSchema.extend({ planHash: z.string().min(1).max(200), confirmation: z.literal('DELETE').optional() }).strict();
export type OperationInput = z.infer<typeof operationSchema>;
export type OperationCommit = z.infer<typeof commitSchema>;

export class ContentOperationError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

export function unavailable(): never { throw new ContentOperationError(404, 'RESOURCE_UNAVAILABLE', 'Resource unavailable.'); }
export function conflict(code: string, message: string): never { throw new ContentOperationError(409, code, message); }
