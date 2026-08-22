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
    // 1st query: assertOwnedConfiguration
    query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    // 2nd query: INSERT ... RETURNING *
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

    const [sql, params] = query.mock.calls[1];
    // Regression guard: the old UNIQUE used only (id_user, id_zalo_setting). The fix
    // adds id_chatbot so toggling chatbot A never bleeds into chatbot B.
    expect(String(sql)).toMatch(/ON CONFLICT\s*\(id_user,\s*id_zalo_setting,\s*id_chatbot\)/i);
    expect(String(sql)).not.toMatch(/ON CONFLICT\s*\(id_user,\s*id_zalo_setting\)(?!,)/i);
    expect(String(sql)).toMatch(/DO UPDATE SET\s+is_enabled\s*=/i);
    expect(params).toEqual([1, 10, 5, true]);
  });

  it('accepts null id_chatbot for the default unlinked row', async () => {
    query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    query.mockResolvedValueOnce({
      rows: [{ id_user: 1, id_zalo_setting: 10, id_chatbot: null, is_enabled: true }],
    });

    await repository.setEnabled(1, 10, null, true);

    const [sql, params] = query.mock.calls[1];
    expect(String(sql)).toMatch(/INSERT INTO chatbot_zalo_account_settings/i);
    expect(String(sql)).not.toMatch(/UPDATE\s+chatbot_zalo_account_settings/i);
    expect(params).toEqual([1, 10, null, true]);
  });

  it('toggling chatbot A never touches chatbot B (different id_chatbot params)', async () => {
    query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    query.mockResolvedValueOnce({ rows: [{ id_user: 1, id_zalo_setting: 10, id_chatbot: 5, is_enabled: true }] });
    await repository.setEnabled(1, 10, 5, true);

    query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    query.mockResolvedValueOnce({ rows: [{ id_user: 1, id_zalo_setting: 10, id_chatbot: 6, is_enabled: false }] });
    await repository.setEnabled(1, 10, 6, false);

    // Two distinct calls, two distinct (id_user, zalo, id_chatbot) tuples.
    const callA = query.mock.calls[1];
    const callB = query.mock.calls[3];
    expect(callA[1]).toEqual([1, 10, 5, true]);
    expect(callB[1]).toEqual([1, 10, 6, false]);
    // Both must use the per-chatbot UNIQUE — never the old (user, zalo) one.
    expect(String(callA[0])).toMatch(/ON CONFLICT\s*\(id_user,\s*id_zalo_setting,\s*id_chatbot\)/i);
    expect(String(callB[0])).toMatch(/ON CONFLICT\s*\(id_user,\s*id_zalo_setting,\s*id_chatbot\)/i);
  });

  it('never writes id_sub_assistant from setEnabled (auto-fill removed by Bug 2.3)', async () => {
    // Regression guard for Bug 2.3: the old code path would copy
    // custom_chatbots.id_sub_assistant into chatbot_zalo_account_settings.
    // That indirection was removed; setEnabled() should now stay focused on
    // toggling the is_enabled flag with no sub_assistant side effect.
    // 1st query: assertOwnedConfiguration (added upstream)
    query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    // 2nd query: INSERT ... RETURNING *
    query.mockResolvedValueOnce({
      rows: [{ id_user: 1, id_zalo_setting: 10, id_chatbot: 5, is_enabled: true, id_sub_assistant: null }],
    });

    await repository.setEnabled(1, 10, 5, true);

    const [upsertSql, upsertParams] = query.mock.calls[1];
    expect(String(upsertSql)).toMatch(/INSERT INTO chatbot_zalo_account_settings/i);
    expect(upsertParams).toEqual([1, 10, 5, true]);
    expect(String(upsertSql)).not.toMatch(/id_sub_assistant\s*=\s*EXCLUDED\.id_sub_assistant/i);
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

describe('chatbotZaloAccount.repository.pickEnabledChatbotForZalo', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('returns null when no chatbot is enabled for the (user, zalo) pair', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const result = await repository.pickEnabledChatbotForZalo(1, 10, 12345);
    expect(result).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('returns the only enabled chatbot when there is exactly one', async () => {
    query.mockResolvedValueOnce({ rows: [{ id_chatbot: 7 }] });
    const result = await repository.pickEnabledChatbotForZalo(1, 10, 12345);
    expect(result).toBe(7);
  });

  it('round-robins deterministically by seed so the same sender always lands on the same chatbot', async () => {
    // Three chatbots enabled for the (user, zalo) pair, ordered ASC by id.
    // mockResolvedValue (not Once) because we call the picker multiple times
    // in the same test to assert determinism.
    query.mockResolvedValue({ rows: [{ id_chatbot: 1 }, { id_chatbot: 2 }, { id_chatbot: 3 }] });
    const a = await repository.pickEnabledChatbotForZalo(1, 10, 0);
    const b = await repository.pickEnabledChatbotForZalo(1, 10, 1);
    const c = await repository.pickEnabledChatbotForZalo(1, 10, 2);
    expect(new Set([a, b, c]).size).toBe(3);
    // Stable: same seed → same bot
    const a2 = await repository.pickEnabledChatbotForZalo(1, 10, 0);
    expect(a2).toBe(a);
  });

  it('ignores chatbots that are no longer active (is_active=false)', async () => {
    // The SQL filter handles inactive chatbots; the repository just consumes
    // whatever the DB returns. Verify the SQL includes the active filter.
    query.mockResolvedValueOnce({ rows: [{ id_chatbot: 11 }] });
    await repository.pickEnabledChatbotForZalo(1, 10, 0);

    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toMatch(/JOIN\s+custom_chatbots/i);
    expect(String(sql)).toMatch(/cb\.is_active\s*=\s*true/i);
    expect(String(sql)).toMatch(/czs\.is_enabled\s*=\s*true/i);
    expect(params).toEqual([1, 10]);
  });
});