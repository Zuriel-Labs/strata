// @vitest-environment node

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/db/database';
import { countBoardsAboveLabelLimit, countSystemAdmins, getCardById, getMaxLabelsPerBoard, getUserByUsername, listBoardsWithDuplicateLabelIds, updateMaxLabelsPerBoard } from '../src/db/repositories';
import { closeDatabase } from '../src/db/database';
import { createSchema } from '../src/db/schema';

beforeAll(() => {
  process.env.SEED_DATA = 'true';
});

describe('backend foundation', () => {
  afterEach(() => {
    closeDatabase();
  });

  it('seeds the bootstrap system administrator', async () => {
    const db = await createDatabase(':memory:');
    const admin = getUserByUsername(db, 'admin');

    expect(admin).not.toBeNull();
    expect(admin?.platformRole).toBe('system_admin');
    expect(countSystemAdmins(db)).toBeGreaterThanOrEqual(1);
  });

  it('adds the rich description column exactly once across repeated starts', async () => {
    const db = await createDatabase(':memory:');

    createSchema(db);
    createSchema(db);

    const columns = db.prepare('PRAGMA table_info(cards)').all() as Array<{ name: string }>;
    expect(columns.filter(column => column.name === 'description_json')).toHaveLength(1);
  });

  it('adds the label policy and Board label revision exactly once without rewriting labels', async () => {
    const db = await createDatabase(':memory:');
    const before = db.prepare('SELECT id, labels_json as labelsJson FROM boards ORDER BY id').all();

    createSchema(db);
    createSchema(db);

    const settings = db.prepare('SELECT id, max_labels_per_board as maxLabelsPerBoard FROM platform_settings').all();
    expect(settings).toEqual([{ id: 1, maxLabelsPerBoard: 12 }]);

    const columns = db.prepare('PRAGMA table_info(boards)').all() as Array<{ name: string }>;
    expect(columns.filter(column => column.name === 'labels_revision')).toHaveLength(1);
    expect(db.prepare('SELECT MIN(labels_revision) as minimum, MAX(labels_revision) as maximum FROM boards').get()).toEqual({ minimum: 0, maximum: 0 });
    expect(db.prepare('SELECT id, labels_json as labelsJson FROM boards ORDER BY id').all()).toEqual(before);
  });

  it('upgrades a legacy label schema and repairs an invalid legacy policy without data loss', async () => {
    const db = await createDatabase(':memory:');
    const before = db.prepare('SELECT id, labels_json AS labelsJson FROM boards ORDER BY id').all();
    db.exec(`
      DROP TABLE platform_settings;
      CREATE TABLE platform_settings (id INTEGER PRIMARY KEY, max_labels_per_board, updated_at TEXT NOT NULL);
      INSERT INTO platform_settings VALUES (1, 0, 'legacy-invalid');
      ALTER TABLE boards DROP COLUMN labels_revision;
    `);

    createSchema(db);

    expect(db.prepare('SELECT max_labels_per_board AS maxLabelsPerBoard FROM platform_settings WHERE id = 1').get()).toEqual({ maxLabelsPerBoard: 12 });
    expect(db.prepare('SELECT id, labels_json AS labelsJson FROM boards ORDER BY id').all()).toEqual(before);
    expect(db.prepare('PRAGMA quick_check').get()).toEqual({ quick_check: 'ok' });
    expect(db.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
  });

  it('reads and updates policy metadata and inventories duplicate IDs without rewriting Board data', async () => {
    const db = await createDatabase(':memory:');
    expect(getMaxLabelsPerBoard(db)).toBe(12);
    updateMaxLabelsPerBoard(db, 2);
    expect(getMaxLabelsPerBoard(db)).toBe(2);
    expect(countBoardsAboveLabelLimit(db, 2)).toBe(3);

    const duplicateLabels = [{ id: 'duplicate', name: 'One', color: '#123456' }, { id: 'duplicate', name: 'Two', color: '#654321' }];
    db.prepare('UPDATE boards SET labels_json = ? WHERE id = ?').run(JSON.stringify(duplicateLabels), 'b1');
    const before = db.prepare('SELECT labels_json AS labelsJson FROM boards WHERE id = ?').get('b1');
    expect(listBoardsWithDuplicateLabelIds(db)).toContainEqual({ boardId: 'b1', duplicateIds: ['duplicate'] });
    expect(db.prepare('SELECT labels_json AS labelsJson FROM boards WHERE id = ?').get('b1')).toEqual(before);
  });

  it('derives a rich document from a legacy multiline description without changing its text', async () => {
    const db = await createDatabase(':memory:');
    const cardId = String((db.prepare('SELECT id FROM cards LIMIT 1').get() as { id: string }).id);
    const legacy = 'First line\r\n\r\nThird line with <angle brackets>';
    db.prepare('UPDATE cards SET description = ?, description_json = NULL WHERE id = ?').run(legacy, cardId);

    const card = getCardById(db, cardId);

    expect(card?.description).toBe(legacy);
    expect(card?.descriptionDocument).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First line' }] },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: 'Third line with <angle brackets>' }] },
      ],
    });
  });

  it('falls back to legacy text when stored rich JSON is malformed', async () => {
    const db = await createDatabase(':memory:');
    const cardId = String((db.prepare('SELECT id FROM cards LIMIT 1').get() as { id: string }).id);
    db.prepare("UPDATE cards SET description = 'safe fallback', description_json = '{bad json' WHERE id = ?").run(cardId);

    expect(getCardById(db, cardId)?.descriptionDocument).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'safe fallback' }] }],
    });
  });
});
