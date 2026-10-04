/**
 * PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G2 — "Liên hệ khách để lại" trong Hộp thư: nhân viên chỉ thấy / đánh dấu được
 * liên hệ của tài khoản Zalo cá nhân được giao. Liên hệ Telegram / web / kênh khác giữ nguyên.
 * (Kết quả trên Postgres thật: backend/tests/integration/inboxAccountAssignment.test.js.)
 */
import { describe, it, expect, jest } from '@jest/globals';

const { default: repo } = await import('../chatbotContactAlert.repository.js');

const fakeQueryable = () => ({ query: jest.fn().mockResolvedValue({ rows: [] }) });
const SCOPE_CLAUSE = /\(a\.last_source <> 'zalo_personal' OR zc\.id_zalo_setting = ANY\(\$(\d+)::bigint\[\]\)\)/;

describe('listForOwner — phạm vi tài khoản Zalo được giao', () => {
  it('nhân viên: cả 3 truy vấn (danh sách, tổng, đang mở) có điều kiện phạm vi, mảng id là tham số', async () => {
    const q = fakeQueryable();
    q.query.mockResolvedValue({ rows: [{ total: '0', open_count: '0' }] });

    await repo.listForOwner(100, { accessibleZaloAccountIds: [5, 9] }, q);

    expect(q.query).toHaveBeenCalledTimes(3);
    for (const [sql, params] of q.query.mock.calls) {
      const match = sql.match(SCOPE_CLAUSE);
      expect(match).not.toBeNull();
      expect(params[Number(match[1]) - 1]).toEqual([5, 9]);
    }
  });

  it('liên hệ không phải Zalo cá nhân (web / channel) vẫn qua điều kiện — chỉ nguồn zalo_personal bị lọc', async () => {
    const q = fakeQueryable();
    await repo.listForOwner(100, { accessibleZaloAccountIds: [] }, q);

    const [sql] = q.query.mock.calls[0];
    expect(sql).toContain(`a.last_source <> 'zalo_personal' OR`);
  });

  it('AND với bộ lọc accountId nhân viên gửi lên (không thay thế): id ngoài phạm vi không lộ gì', async () => {
    const q = fakeQueryable();
    await repo.listForOwner(100, { accountId: '77', accessibleZaloAccountIds: [5] }, q);

    const [sql, params] = q.query.mock.calls[0];
    expect(sql).toMatch(/zc\.id_zalo_setting::text = \$2/);
    expect(sql).toMatch(/ANY\(\$3::bigint\[\]\)/);
    expect(params.slice(0, 3)).toEqual([100, '77', [5]]);
  });

  it('CHỦ (null): không điều kiện phạm vi; thiếu / sai kiểu → coi như [] (chặn liên hệ Zalo cá nhân)', async () => {
    const q = fakeQueryable();
    await repo.listForOwner(100, { accessibleZaloAccountIds: null }, q);
    expect(q.query.mock.calls[0][0]).not.toMatch(/ANY\(/);
    expect(q.query.mock.calls[0][1]).toEqual([100, 50, 0]);

    const q2 = fakeQueryable();
    await repo.listForOwner(100, {}, q2);
    const match = q2.query.mock.calls[0][0].match(SCOPE_CLAUSE);
    expect(match).not.toBeNull();
    expect(q2.query.mock.calls[0][1][Number(match[1]) - 1]).toEqual([]);
  });
});

describe('markHandled / unmarkHandled — không đoán id để đụng liên hệ của tài khoản chưa giao', () => {
  it('nhân viên: UPDATE có điều kiện EXISTS hội thoại thuộc tài khoản được giao (chỉ áp cho nguồn zalo_personal)', async () => {
    const q = fakeQueryable();
    q.query.mockResolvedValue({ rows: [{ id: 3 }] });

    await repo.markHandled(3, 100, 200, q, { accessibleZaloAccountIds: [5] });
    let [sql, params] = q.query.mock.calls[0];
    expect(sql).toMatch(/WHERE id = \$1 AND id_user = \$2 AND \(last_source <> 'zalo_personal' OR EXISTS \(\s*SELECT 1 FROM zalo_personal_conversations zc\s+WHERE zc\.id = chatbot_contact_alerts\.last_conversation_id\s+AND zc\.id_zalo_setting = ANY\(\$4::bigint\[\]\)/);
    expect(params).toEqual([3, 100, 200, [5]]);

    q.query.mockClear();
    await repo.unmarkHandled(3, 100, q, { accessibleZaloAccountIds: [5] });
    [sql, params] = q.query.mock.calls[0];
    expect(sql).toMatch(/ANY\(\$3::bigint\[\]\)/);
    expect(params).toEqual([3, 100, [5]]);
  });

  it('CHỦ (null): UPDATE y như cũ, không điều kiện phạm vi', async () => {
    const q = fakeQueryable();
    await repo.markHandled(3, 100, 100, q, { accessibleZaloAccountIds: null });
    expect(q.query.mock.calls[0][0]).not.toMatch(/ANY\(/);
    expect(q.query.mock.calls[0][1]).toEqual([3, 100, 100]);

    q.query.mockClear();
    await repo.unmarkHandled(3, 100, q, { accessibleZaloAccountIds: null });
    expect(q.query.mock.calls[0][0]).not.toMatch(/ANY\(/);
    expect(q.query.mock.calls[0][1]).toEqual([3, 100]);
  });

  it('HỎNG THÌ CHẶN: thiếu phạm vi → điều kiện với mảng rỗng', async () => {
    const q = fakeQueryable();
    await repo.markHandled(3, 100, 100, q);
    expect(q.query.mock.calls[0][1]).toEqual([3, 100, 100, []]);

    q.query.mockClear();
    await repo.unmarkHandled(3, 100, q);
    expect(q.query.mock.calls[0][1]).toEqual([3, 100, []]);
  });
});
