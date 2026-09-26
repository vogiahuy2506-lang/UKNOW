import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockDbQuery = jest.fn();
const mockSendSystemEmail = jest.fn().mockResolvedValue({ messageId: 'test' });

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query: mockDbQuery },
}));
jest.unstable_mockModule('../../../utils/systemEmail.util.js', () => ({
  sendSystemEmail: mockSendSystemEmail,
  // Mô phỏng tối giản — chỉ cần bọc content lại để test escape nội dung bên trong, không cần
  // đúng y hệt template thật.
  buildBaseTemplate: ({ subtitle, content, footerNote }) => `<div>${subtitle}${content}${footerNote}</div>`,
}));

const {
  sendInternalWithdrawalNotification,
  getUserWithdrawalPrefill,
  getUserWithdrawals,
  adminListWithdrawals,
} = await import('../affiliateWithdrawal.service.js');

// PR-4 (đợt rà soát 26/09), Việc 6.2 — email nội bộ nội suy thẳng full_name/bank_name/
// bank_account_number/bank_account_name vào HTML chỉ .trim(), không escape.
describe('sendInternalWithdrawalNotification — Việc 6.2: escapeHtml cho mọi trường người dùng nhập', () => {
  beforeEach(() => jest.clearAllMocks());

  const baseWithdrawal = {
    id: 1,
    full_name: 'Nguyễn Văn A',
    amount_gross: 1000000,
    tax_amount: 100000,
    amount_net: 900000,
    bank_name: 'Vietcombank',
    bank_account_number: '0123456789',
    bank_account_name: 'NGUYEN VAN A',
    requested_at: new Date('2026-09-26T00:00:00Z'),
  };

  it('full_name chứa thẻ HTML/script bị escape trong nội dung email', async () => {
    const withdrawal = { ...baseWithdrawal, full_name: '<script>alert(1)</script>' };
    await sendInternalWithdrawalNotification(withdrawal, 'partner@example.com');

    expect(mockSendSystemEmail).toHaveBeenCalledTimes(1);
    const { html } = mockSendSystemEmail.mock.calls[0][0];
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  // "Nợ nhỏ" PR-4/PR-6 (26/09) — TIÊU ĐỀ email là văn bản thường, không phải HTML. escapeHtml ở
  // đây từng làm tên có "&" hiện nguyên "&amp;" trong hộp thư kế toán. Đã bỏ escapeHtml cho
  // subject, GIỮ NGUYÊN cho thân HTML (2 test trên/dưới không đổi).
  it('full_name có "&" → TIÊU ĐỀ giữ nguyên văn bản thô, KHÔNG escape thành "&amp;"', async () => {
    const withdrawal = { ...baseWithdrawal, full_name: 'Trần Văn A & Con' };
    await sendInternalWithdrawalNotification(withdrawal, 'partner@example.com');

    const { subject } = mockSendSystemEmail.mock.calls[0][0];
    expect(subject).toContain('Trần Văn A & Con');
    expect(subject).not.toContain('&amp;');
  });

  it('bank_name / bank_account_number / bank_account_name đều được escape', async () => {
    const withdrawal = {
      ...baseWithdrawal,
      bank_name: '<img src=x onerror=alert(1)>',
      bank_account_number: '"><script>x</script>',
      bank_account_name: "O'Brien <b>test</b>",
    };
    await sendInternalWithdrawalNotification(withdrawal, 'partner@example.com');

    const { html } = mockSendSystemEmail.mock.calls[0][0];
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script>x</script>');
    expect(html).not.toContain('<b>test</b>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&quot;&gt;&lt;script&gt;x&lt;/script&gt;');
    expect(html).toContain('O&#39;Brien &lt;b&gt;test&lt;/b&gt;');
  });

  it('dữ liệu bình thường (không có ký tự đặc biệt) vẫn hiển thị đúng, không bị escape kép', async () => {
    await sendInternalWithdrawalNotification(baseWithdrawal, 'partner@example.com');
    const { html, subject } = mockSendSystemEmail.mock.calls[0][0];
    expect(html).toContain('Nguyễn Văn A');
    expect(html).toContain('Vietcombank');
    expect(subject).toContain('Nguyễn Văn A');
  });
});

// PR-4 (đợt rà soát 26/09), Việc 6.5 — id_card_issued_date là cột DATE: trả thẳng ra JSON bị
// node-postgres đổi thành Date 00:00 giờ VN rồi JSON.stringify in UTC (lùi 1 ngày). Rà cả 3 nơi
// SELECT cột này trong affiliateWithdrawal.service.js.
describe('Việc 6.5 — id_card_issued_date phải ép ::text ở SQL, không trả Date thô', () => {
  beforeEach(() => jest.clearAllMocks());

  it('getUserWithdrawalPrefill: SQL ép ::text, giữ đúng chuỗi DB trả về', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 1, username: 'u', email: 'e@e.com', full_name: 'A', phone: null, invoice_profile: {} }] })
      .mockResolvedValueOnce({ rows: [{ bank_name: 'VCB', bank_account_number: '1', bank_account_name: 'A', id_card_issued_date: '2021-05-10', id_card_issued_place: 'HN' }] });

    const result = await getUserWithdrawalPrefill(1);

    const [, sql2] = mockDbQuery.mock.calls; // 2nd call is affiliate_withdrawals query
    expect(sql2[0]).toContain('id_card_issued_date::text AS id_card_issued_date');
    expect(result.idCardIssuedDate).toBe('2021-05-10');
  });

  it('getUserWithdrawals: SQL ép ::text', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id_card_issued_date: '2021-05-10' }] });
    const result = await getUserWithdrawals(1);

    const [sql] = mockDbQuery.mock.calls[0];
    expect(sql).toContain('id_card_issued_date::text AS id_card_issued_date');
    expect(result[0].id_card_issued_date).toBe('2021-05-10');
  });

  it('adminListWithdrawals: SQL ép ::text', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 1, id_card_issued_date: '2021-05-10', id_card_number_enc: null }] });
    const result = await adminListWithdrawals({});

    const [sql] = mockDbQuery.mock.calls[0];
    expect(sql).toContain('w.id_card_issued_date::text AS id_card_issued_date');
    expect(result[0].id_card_issued_date).toBe('2021-05-10');
  });
});
