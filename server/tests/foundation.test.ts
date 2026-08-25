// @vitest-environment node

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/db/database';
import { countSystemAdmins, getCardById, getUserByUsername } from '../src/db/repositories';
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
