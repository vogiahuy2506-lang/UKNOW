import { jest } from '@jest/globals';

const query = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query },
}));

const { default: repository } = await import('../chatbotZaloAccount.repository.js');

describe('chatbotZaloAccount.repository.setEnabled (per-chatbot)', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('uses ON CONFLICT (id_user, id_zalo_setting, id_chatbot) so it scopes the toggle to ONE chatbot', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 100,
        id_user: 1,
        id_zalo_setting: 10,
        id_chatbot: 5,
        is_enabled: true,
      }],
    });

    const result = await repository.setEnabled(1, 10, 5, true);

    expect(result).toEqual({
      id: 100,
      id_user: 1,
      id_zalo_setting: 10,
      id_chatbot: 5,
      is_enabled: true,
    });

    const [sql, params] = query.mock.calls[0];
    // Regression guard: the old UNIQUE used only (id_user, id_zalo_setting). The fix
    // adds id_chatbot so toggling chatbot A never bleeds into chatbot B.
    expect(String(sql)).toMatch(/ON CONFLICT\s*\(id_user,\s*id_zalo_setting,\s*id_chatbot\)/i);
    expect(String(sql)).not.toMatch(/ON CONFLICT\s*\(id_user,\s*id_zalo_setting\)(?!,)/i);
    expect(String(sql)).toMatch(/DO UPDATE SET\s+is_enabled\s*=/i);
    expect(params).toEqual([1, 10, 5, true]);
  });

  it('accepts null id_chatbot for the default unlinked row', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id_user: 1, id_zalo_setting: 10, id_chatbot: null, is_enabled: true }],
    });

    await repository.setEnabled(1, 10, null, true);

    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toMatch(/INSERT INTO chatbot_zalo_account_settings/i);
    expect(String(sql)).not.toMatch(/UPDATE\s+chatbot_zalo_account_settings/i);
    expect(params).toEqual([1, 10, null, true]);
  });

  it('toggling chatbot A never touches chatbot B (different id_chatbot params)', async () => {
    query.mockResolvedValueOnce({ rows: [{ id_user: 1, id_zalo_setting: 10, id_chatbot: 5, is_enabled: true }] });
    await repository.setEnabled(1, 10, 5, true);

    query.mockResolvedValueOnce({ rows: [{ id_user: 1, id_zalo_setting: 10, id_chatbot: 6, is_enabled: false }] });
    await repository.setEnabled(1, 10, 6, false);

    // Two distinct calls, two distinct (id_user, zalo, id_chatbot) tuples.
    const callA = query.mock.calls[0];
    const callB = query.mock.calls[1];
    expect(callA[1]).toEqual([1, 10, 5, true]);
    expect(callB[1]).toEqual([1, 10, 6, false]);
    // Both must use the per-chatbot UNIQUE — never the old (user, zalo) one.
    expect(String(callA[0])).toMatch(/ON CONFLICT\s*\(id_user,\s*id_zalo_setting,\s*id_chatbot\)/i);
    expect(String(callB[0])).toMatch(/ON CONFLICT\s*\(id_user,\s*id_zalo_setting,\s*id_chatbot\)/i);
  });
});

describe('chatbotZaloAccount.repository.listAccountsForUser', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('returns id (zalo_settings.id) and chatbot_enabled alias — NOT id_zalo_setting', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { id: 10, id_user: 1, chatbot_enabled: true, id_chatbot: 5, chatbot_name: 'Bot A' },
        { id: 20, id_user: 1, chatbot_enabled: false, id_chatbot: null, chatbot_name: null },
      ],
    });

    const rows = await repository.listAccountsForUser(1);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: 10, chatbot_enabled: true });
    expect(rows[0]).not.toHaveProperty('id_zalo_setting');

    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toMatch(/FROM\s+zalo_settings\s+zs/i);
    expect(params).toEqual([1]);
  });

  it('when chatbotId is passed, scopes LEFT JOIN to that chatbot', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { id: 10, id_user: 1, chatbot_enabled: true, id_chatbot: 5, chatbot_name: 'Bot A' },
      ],
    });

    const rows = await repository.listAccountsForUser(1, 5);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 10, chatbot_enabled: true });

    const [sql, params] = query.mock.calls[0];
    // When chatbotId is provided, the query uses a direct LEFT JOIN with the
    // chatbot filter (id_chatbot = $2), NOT the LATERAL most-recent-row fallback.
    expect(String(sql)).toMatch(/LEFT JOIN chatbot_zalo_account_settings\s+czs/i);
    expect(String(sql)).toMatch(/czs\.id_chatbot\s*=\s*\$2/i);
    expect(String(sql)).not.toMatch(/LEFT JOIN LATERAL/i);
    expect(params).toEqual([1, 5]);
  });

  it('when chatbotId is omitted, falls back to LATERAL most-recent-row (legacy behavior)', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await repository.listAccountsForUser(1);

    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toMatch(/LEFT JOIN LATERAL/i);
    expect(params).toEqual([1]);
  });
});

describe('chatbotZaloAccount.repository.getSettings (per-chatbot)', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('scopes to the requested id_chatbot when provided', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id_user: 1, id_zalo_setting: 10, id_chatbot: 5, is_enabled: true }],
    });

    await repository.getSettings(1, 10, { idChatbot: 5 });

    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toMatch(/czs\.id_user\s*=\s*\$1/i);
    expect(String(sql)).toMatch(/czs\.id_zalo_setting\s*=\s*\$2/i);
    expect(String(sql)).toMatch(/\(\$3::bigint IS NULL OR czs\.id_chatbot = \$3::bigint\)/i);
    expect(params).toEqual([1, 10, 5]);
  });

  it('legacy call without idChatbot still works (returns most recent row)', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id_user: 1, id_zalo_setting: 10, id_chatbot: null, is_enabled: true }],
    });

    await repository.getSettings(1, 10);

    const [, params] = query.mock.calls[0];
    expect(params).toEqual([1, 10, null]);
  });
});