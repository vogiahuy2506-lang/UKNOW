/**
 * Unit-ish tests for the Telegram repo's session-string methods.
 * Verify SQL shape and parameter forwarding using a mocked
 * `db.query`.
 */

import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// From src/repositories/chatbot/__tests__ -> backend/src/config/database.js
const dbPath = path
  .resolve(__dirname, '..', '..', '..', 'config', 'database.js')
  .replace(/\\/g, '/');

const dbMock = { query: jest.fn() };

let repo;

beforeEach(async () => {
  jest.resetModules();
  jest.unstable_mockModule(dbPath, () => ({ default: dbMock }));
  const mod = await import(
    '../../../repositories/chatbot/chatbotTelegram.repository.js'
  );
  repo = mod.default;
  dbMock.query.mockReset();
});

describe('ChatbotTelegramRepository session methods', () => {
  it('getSessionString returns null when the row has no string', async () => {
    dbMock.query.mockResolvedValueOnce({ rows: [{ session_string: null }] });
    const blob = await repo.getSessionString(12345);
    expect(blob).toBeNull();
    const [sql, params] = dbMock.query.mock.calls[0];
    expect(sql).toMatch(/SELECT session_string FROM telegram_accounts/);
    expect(params).toEqual([12345]);
  });

  it('getSessionString appends userClause when userId is given', async () => {
    dbMock.query.mockResolvedValueOnce({ rows: [{ session_string: 'S' }] });
    const blob = await repo.getSessionString(12345, { userId: 9 });
    expect(blob).toBe('S');
    const [sql, params] = dbMock.query.mock.calls[0];
    expect(sql).toMatch(/AND id_user = \$2/);
    expect(params).toEqual([12345, 9]);
  });

  it('upsertSession uses INSERT ... ON CONFLICT and forwards params', async () => {
    dbMock.query.mockResolvedValueOnce({
      rows: [{ id: 1, telegram_user_id: 12345, session_string: 'S' }],
    });
    const row = await repo.upsertSession({
      telegramUserId: 12345,
      sessionString: 'S',
      phone: '+84',
      firstName: 'Alice',
      lastName: null,
      username: 'alice',
      userId: 7,
    });
    expect(row.telegram_user_id).toBe(12345);
    const [sql, params] = dbMock.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO telegram_accounts/);
    expect(sql).toMatch(/ON CONFLICT \(telegram_user_id\) DO UPDATE/);
    expect(params).toEqual([7, 12345, '+84', 'Alice', null, 'alice', 'S']);
  });

  it('clearSessionString sets session_string = NULL', async () => {
    dbMock.query.mockResolvedValueOnce({ rows: [] });
    await repo.clearSessionString(12345);
    const [sql, params] = dbMock.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE telegram_accounts SET session_string = NULL/);
    expect(params).toEqual([12345]);
  });

  it('listAllSessions returns rows verbatim', async () => {
    const fakeRows = [{ id: 1, telegram_user_id: 111 }];
    dbMock.query.mockResolvedValueOnce({ rows: fakeRows });
    const rows = await repo.listAllSessions();
    expect(rows).toEqual(fakeRows);
    const [sql] = dbMock.query.mock.calls[0];
    expect(sql).toMatch(/WHERE session_string IS NOT NULL/);
  });

  it('bindAccount returns the updated row or null', async () => {
    dbMock.query.mockResolvedValueOnce({
      rows: [{ id: 1, telegram_user_id: 12345, id_user: 5 }],
    });
    const row = await repo.bindAccount(12345, 5);
    expect(row.id_user).toBe(5);
    const [sql, params] = dbMock.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE telegram_accounts/);
    expect(params).toEqual([12345, 5]);

    dbMock.query.mockReset();
    dbMock.query.mockResolvedValueOnce({ rows: [] });
    expect(await repo.bindAccount(99999, 1)).toBeNull();
  });

  it('deleteByTelegramUserId returns the deleted row or null', async () => {
    dbMock.query.mockResolvedValueOnce({
      rows: [{ id: 1, telegram_user_id: 12345 }],
    });
    const row = await repo.deleteByTelegramUserId(12345);
    expect(row.id).toBe(1);
    const [sql, params] = dbMock.query.mock.calls[0];
    expect(sql).toMatch(/DELETE FROM telegram_accounts WHERE telegram_user_id = \$1/);
    expect(params).toEqual([12345]);

    dbMock.query.mockReset();
    dbMock.query.mockResolvedValueOnce({ rows: [] });
    expect(await repo.deleteByTelegramUserId(99999)).toBeNull();
  });
});
