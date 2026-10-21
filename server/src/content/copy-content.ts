import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Card } from '../../../src/types';
import { createBoard, createList, createCard, getCardById, getMaxCardPosition, updateCard } from '../db/repositories';
import { applyRealtimeAutomations } from '../automation/realtime';
import type { OperationInput } from './operation-contract';
import type { ResolvedOperation } from './operation-plan';

export function reindex(db: Database.Database, table: 'lists' | 'cards', parentColumn: 'board_id' | 'list_id', parentId: string, movedId?: string, position = 1_000_000) {
  const rows = db.prepare(`SELECT id FROM ${table} WHERE ${parentColumn} = ? AND archived = 0 ORDER BY position, id`).all(parentId) as { id: string }[];
  const ordered = rows.filter(row => row.id !== movedId);
  if (movedId) ordered.splice(Math.min(position, ordered.length), 0, { id: movedId });
  ordered.forEach((row, index) => db.prepare(`UPDATE ${table} SET position = ? WHERE id = ? AND position != ?`).run(index, row.id, index));
}

export function copyContent(db: Database.Database, actorId: string, operationId: string, input: OperationInput, plan: ResolvedOperation) {
  let boardId = plan.destinationBoard?.id ?? '';
  const resultIds: string[] = [];
  const listIds = new Map<string, string>();
  const labelIds = new Map<string, string>();
  if (plan.resourceType === 'board' && plan.sourceBoard && plan.destinationWorkspace) {
    boardId = randomUUID();
    const labels = input.keep.labels ? plan.sourceBoard.labels.map(label => {
      const id = randomUUID(); labelIds.set(label.id, id); return { ...label, id };
    }) : [];
    createBoard(db, boardId, input.title ?? `${plan.sourceBoard.title} (copy)`, plan.destinationWorkspace.id, 'private', input.color ?? plan.sourceBoard.color, JSON.stringify(labels));
    db.prepare('UPDATE boards SET is_template = ?, source_template_id = ?, source_template_revision = ? WHERE id = ?')
      .run(Number(input.isTemplate), plan.sourceBoard.isTemplate ? plan.sourceBoard.id : null, plan.sourceBoard.isTemplate ? plan.sourceBoard.revision : null, boardId);
    db.prepare('INSERT INTO board_admin_grants (id, user_id, board_id, granted_by_user_id, created_at) VALUES (?, ?, ?, ?, ?)').run(randomUUID(), actorId, boardId, actorId, new Date().toISOString());
    resultIds.push(boardId);
  } else if (plan.sourceBoard?.id === boardId) {
    plan.sourceBoard.labels.forEach(label => labelIds.set(label.id, label.id));
  } else input.labelMap.forEach(entry => { if (entry.destinationId) labelIds.set(entry.sourceId, entry.destinationId); });
  if (plan.resourceType === 'card' && plan.sourceCard && plan.destinationList) listIds.set(plan.sourceCard.listId, plan.destinationList.id);
  else for (const source of plan.lists) {
    const id = randomUUID();
    const position = Number(db.prepare('SELECT COALESCE(MAX(position), -1) + 1 FROM lists WHERE board_id = ? AND archived = 0').pluck().get(boardId));
    createList(db, id, plan.resourceType === 'list' ? input.title ?? `${source.title} (copy)` : source.title, boardId, position);
    if (source.color) db.prepare('UPDATE lists SET color = ? WHERE id = ?').run(source.color, id);
    listIds.set(source.id, id);
    if (plan.resourceType === 'list') { resultIds.push(id); reindex(db, 'lists', 'board_id', boardId, id, input.position); }
  }
  const createdCardIds: string[] = [];
  for (const source of plan.cards) {
    const listId = listIds.get(source.listId);
    if (!listId) throw new Error('Copy destination list was not created.');
    const id = randomUUID();
    createCard(db, id, plan.resourceType === 'card' ? input.title ?? `${source.title} (copy)` : source.title, listId, boardId, getMaxCardPosition(db, listId) + 1, actorId);
    const checklists: Card['checklists'] = input.keep.checklists ? source.checklists.map(checklist => ({ ...checklist, id: randomUUID(), items: checklist.items.map(item => ({ ...item, id: randomUUID(), completed: input.keep.checklistCompletion && item.completed })) })) : [];
    const memberIds = [...new Set(source.memberIds.flatMap(memberId => {
      const mapping = input.memberMap.find(entry => entry.sourceId === memberId); return mapping?.destinationId ? [mapping.destinationId] : [];
    }))];
    updateCard(db, id, {
      ...(input.keep.descriptions ? { descriptionDocument: source.descriptionDocument } : {}),
      labelIds: input.keep.labels ? source.labelIds.flatMap(labelId => labelIds.has(labelId) ? [labelIds.get(labelId)!] : []) : [],
      memberIds, checklists, dueDate: input.keep.dueDates ? source.dueDate : null,
      dueDateComplete: input.keep.dueDates && input.keep.dueCompletion && source.dueDateComplete,
    });
    if (plan.resourceType === 'card') { resultIds.push(id); reindex(db, 'cards', 'list_id', listId, id, input.position); }
    createdCardIds.push(id);
    const created = getCardById(db, id);
    if (!created) throw new Error('Copied card unavailable.');
    if (!input.isTemplate) {
      const final = applyRealtimeAutomations(db, created, 'card_created', actorId, undefined, operationId);
      listIds.set(`final:${id}`, final.listId);
    }
  }
  for (const listId of listIds.values()) reindex(db, 'cards', 'list_id', listId);
  return { resultIds, createdCardIds };
}
