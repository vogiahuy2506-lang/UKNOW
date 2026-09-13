import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-2b (13/09/2026, PLAN_CANH_BAO_SAP_HET_HAN_GOI mục 4.2) — tổng quát hoá repository mẫu thư:
 * bỏ hằng WELCOME_TEMPLATE_KEY, 3 hàm nhận templateKey làm tham số đầu để phục vụ cả
 * 'welcome'/'plan_expiring'/'plan_expired' (migration 206 đã nới CHECK).
 */

const query = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query },
}));

const {
  deleteSystemEmailTemplate,
  findSystemEmailTemplate,
  saveSystemEmailTemplate,
} = await import('../systemEmailTemplate.repository.js');

describe('systemEmailTemplate.repository — đa khoá', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('findSystemEmailTemplate SELECT đúng WHERE template_key = $1, dùng đúng templateKey truyền vào', async () => {
    const row = { template_key: 'plan_expiring', subject: 'S', body_html: 'B' };
    query.mockResolvedValueOnce({ rows: [row] });

    const result = await findSystemEmailTemplate('plan_expiring');

    expect(result).toEqual(row);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/WHERE\s+template_key\s*=\s*\$1/i);
    expect(params).toEqual(['plan_expiring']);
  });

  it('findSystemEmailTemplate trả null khi không có row (không throw)', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(findSystemEmailTemplate('plan_expired')).resolves.toBeNull();
  });

  it('saveSystemEmailTemplate INSERT ... ON CONFLICT đúng templateKey ở vị trí đầu tham số', async () => {
    const returned = { template_key: 'plan_expired', subject: 'S2', body_html: 'B2', updated_by: 9 };
    query.mockResolvedValueOnce({ rows: [returned] });

    const result = await saveSystemEmailTemplate('plan_expired', {
      subject: 'S2',
      bodyHtml: 'B2',
      updatedBy: 9,
    });

    expect(result).toEqual(returned);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO system_email_templates/i);
    expect(sql).toMatch(/ON CONFLICT\s*\(template_key\)\s*DO UPDATE/i);
    expect(params).toEqual(['plan_expired', 'S2', 'B2', 9]);
  });

  it('deleteSystemEmailTemplate DELETE đúng WHERE template_key = $1', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await deleteSystemEmailTemplate('welcome');

    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/DELETE FROM system_email_templates/i);
    expect(sql).toMatch(/WHERE\s+template_key\s*=\s*\$1/i);
    expect(params).toEqual(['welcome']);
  });

  // Ba khoá độc lập nhau ở tầng repository — gọi liên tiếp với khoá khác nhau không lẫn
  // tham số của lần gọi trước (bảo vệ khỏi lỗi đóng biến/global state nếu ai đó tái cấu trúc
  // sau này).
  it('gọi liên tiếp 3 khoá khác nhau — mỗi lần dùng đúng key của lần đó, không lẫn', async () => {
    query.mockResolvedValueOnce({ rows: [{ template_key: 'welcome' }] });
    query.mockResolvedValueOnce({ rows: [{ template_key: 'plan_expiring' }] });
    query.mockResolvedValueOnce({ rows: [{ template_key: 'plan_expired' }] });

    await findSystemEmailTemplate('welcome');
    await findSystemEmailTemplate('plan_expiring');
    await findSystemEmailTemplate('plan_expired');

    expect(query.mock.calls[0][1]).toEqual(['welcome']);
    expect(query.mock.calls[1][1]).toEqual(['plan_expiring']);
    expect(query.mock.calls[2][1]).toEqual(['plan_expired']);
  });

  it('dùng queryable truyền vào (transaction client) thay vì db mặc định', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ template_key: 'welcome' }] }) };

    await findSystemEmailTemplate('welcome', client);

    expect(client.query).toHaveBeenCalledTimes(1);
    expect(query).not.toHaveBeenCalled();
  });
});
