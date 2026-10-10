/**
 * PLAN_GIAO_TK_TG_WA PR-H3 — "Liên hệ khách để lại": nhân viên chỉ thấy / đánh dấu được liên hệ Telegram / WhatsApp của tài khoản
 * ĐƯỢC GIAO. Liên hệ nguồn khác (web, Zalo, Zalo OA) không bị lọc ở đây. Kết quả trên Postgres thật: integration H3.
 */
import { describe, it, expect, jest } from '@jest/globals';

const { default: repo } = await import('../chatbotContactAlert.repository.js');

const OWNER = { telegram: null, whatsapp_baileys: null };
const EMP = { telegram: ['7'], whatsapp_baileys: ['1-mot'] };
const ZALO_NULL = { accessibleZaloAccountIds: null };
const fakeQueryable = () => ({ query: jest.fn().mockResolvedValue({ rows: [{ total: '0', open_count: '0' }] }) });
const COND = /\(a\.last_source <> 'channel' OR \(conn\.id IS NOT NULL AND \(conn\.channel NOT IN \('telegram', 'whatsapp_baileys'\) OR \(conn\.channel = 'telegram' AND conn\.external_channel_id = ANY\(\$(\d+)::text\[\]\)\) OR \(conn\.channel = 'whatsapp_baileys' AND conn\.external_channel_id = ANY\(\$(\d+)::text\[\]\)\)\)\)\)/;

describe('listForOwner — phạm vi tài khoản Telegram / WhatsApp được giao', () => {
  it('nhân viên: cả 3 truy vấn (danh sách, tổng, đang mở) có điều kiện, mảng ref là tham số', async () => {
    const q = fakeQueryable();
    await repo.listForOwner(100, { ...ZALO_NULL, accessibleChannelRefs: EMP }, q);
    expect(q.query).toHaveBeenCalledTimes(3);
    for (const [sql, params] of q.query.mock.calls) {
      const match = sql.match(COND);
      expect(match).not.toBeNull();
      expect([params[Number(match[1]) - 1], params[Number(match[2]) - 1]]).toEqual([['7'], ['1-mot']]);
    }
  });

  it('liên hệ nguồn khác (web / zalo_personal) qua điều kiện — chỉ nguồn channel bị lọc; hội thoại đã xoá (conn NULL) bị ẩn với nhân viên', async () => {
    const q = fakeQueryable();
    await repo.listForOwner(100, { ...ZALO_NULL, accessibleChannelRefs: EMP }, q);
    const [sql] = q.query.mock.calls[0];
    expect(sql).toContain("a.last_source <> 'channel' OR (conn.id IS NOT NULL AND");
  });

  it('CHỦ (null cả hai): không điều kiện, tham số y như cũ', async () => {
    const q = fakeQueryable();
    await repo.listForOwner(100, { ...ZALO_NULL, accessibleChannelRefs: OWNER, limit: 50, offset: 0 }, q);
    const [sql, params] = q.query.mock.calls[0];
    expect(sql).not.toMatch(/external_channel_id = ANY/);
    expect(params).toEqual([100, 50, 0]);
  });

  it('HỎNG THÌ CHẶN: thiếu / sai kiểu phạm vi → điều kiện với mảng rỗng; LIMIT / OFFSET vẫn đánh số đúng', async () => {
    const q = fakeQueryable();
    await repo.listForOwner(100, { ...ZALO_NULL, limit: 10, offset: 5 }, q);
    const [sql, params] = q.query.mock.calls[0];
    const match = sql.match(COND);
    expect([params[Number(match[1]) - 1], params[Number(match[2]) - 1]]).toEqual([[], []]);
    expect(params.slice(-2)).toEqual([10, 5]);
    const used = [...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
    expect(Math.max(...used)).toBe(params.length);
  });

  it('AND với bộ lọc accountId nhân viên gửi lên (không thay thế)', async () => {
    const q = fakeQueryable();
    await repo.listForOwner(100, { ...ZALO_NULL, accessibleChannelRefs: EMP, accountId: '77' }, q);
    const [sql, params] = q.query.mock.calls[0];
    expect(params).toContain('77');
    expect(sql).toMatch(COND);
  });
});

describe('markHandled / unmarkHandled — không đoán id để đụng liên hệ Telegram / WhatsApp của tài khoản chưa giao', () => {
  const EXISTS = /last_source <> 'channel' OR EXISTS \(\s*SELECT 1 FROM channel_conversations cc2\s+JOIN channel_connections conn2 ON conn2\.id = cc2\.id_channel\s+WHERE cc2\.id = chatbot_contact_alerts\.last_conversation_id\s+AND \(conn2\.channel NOT IN \('telegram', 'whatsapp_baileys'\) OR \(conn2\.channel = 'telegram' AND conn2\.external_channel_id = ANY\(\$(\d+)::text\[\]\)\) OR \(conn2\.channel = 'whatsapp_baileys' AND conn2\.external_channel_id = ANY\(\$(\d+)::text\[\]\)\)\)/;

  it('nhân viên: UPDATE có EXISTS hội thoại thuộc tài khoản được giao (chỉ áp cho nguồn channel)', async () => {
    const q = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await repo.markHandled(3, 100, 200, q, { ...ZALO_NULL, accessibleChannelRefs: EMP });
    let [sql, params] = q.query.mock.calls[0];
    let match = sql.match(EXISTS);
    expect(match).not.toBeNull();
    expect([params[Number(match[1]) - 1], params[Number(match[2]) - 1]]).toEqual([['7'], ['1-mot']]);

    q.query.mockClear();
    await repo.unmarkHandled(3, 100, q, { ...ZALO_NULL, accessibleChannelRefs: EMP });
    [sql, params] = q.query.mock.calls[0];
    match = sql.match(EXISTS);
    expect([params[Number(match[1]) - 1], params[Number(match[2]) - 1]]).toEqual([['7'], ['1-mot']]);
  });

  it('CHỦ: UPDATE y như cũ; thiếu phạm vi → điều kiện với mảng rỗng', async () => {
    const q = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await repo.markHandled(3, 100, 200, q, { ...ZALO_NULL, accessibleChannelRefs: OWNER });
    expect(q.query.mock.calls[0][0]).not.toMatch(/channel_conversations cc2/);
    expect(q.query.mock.calls[0][1]).toEqual([3, 100, 200]);

    q.query.mockClear();
    await repo.markHandled(3, 100, 200, q, { ...ZALO_NULL });
    expect(q.query.mock.calls[0][1]).toEqual([3, 100, 200, [], []]);
  });
});
