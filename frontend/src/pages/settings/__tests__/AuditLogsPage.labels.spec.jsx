/**
 * Trang Nhật ký hoạt động không được để lọt khoá dịch ra màn hình.
 *
 * Trước 22/09/2026 trang chỉ biết 21 hành động; mọi dòng khác (landing page, chatbot, kết nối Zalo… —
 * khoảng 40% dòng thật của khách) hiện nguyên "auditLogs.actions.X", vì `t()` trả lại chính khoá khi thiếu
 * bản dịch và kiểu viết `t(key) || dự_phòng` không bao giờ rơi xuống dự phòng.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AuditLogsPage from '../AuditLogsPage';
import auditLogsApiService from '../../../features/settings/services/auditLogsApi.service';
import viTranslations from '../../../i18n/vi';

vi.mock('../../../features/settings/services/auditLogsApi.service', () => ({
  default: { getAuditLogs: vi.fn() },
}));
const mockT = (key) => key.split('.').reduce((acc, part) => acc?.[part], viTranslations) ?? key;
vi.mock('../../../i18n', () => ({ useI18n: () => ({ t: mockT, locale: 'vi' }) }));

const row = (id, action, entityType) => ({
  id, action, entity_type: entityType, entity_id: id, details: {}, created_at: '2026-09-20T09:00:00Z',
  user_full_name: 'Chủ Shop', username: 'chushop',
});

describe('AuditLogsPage — nhãn hành động và đối tượng', () => {
  beforeEach(() => vi.clearAllMocks());

  it('dòng của các tính năng thêm sau (landing page, chatbot, kết nối Zalo) hiện nhãn tiếng Việt', async () => {
    auditLogsApiService.getAuditLogs.mockResolvedValue({
      data: {
        data: [
          row(1, 'LANDING_PAGE_CREATED', 'landing_page'),
          row(2, 'ZALO_ACCOUNT_CONNECTED', 'zalo_setting'),
          row(3, 'CHATBOT_CHANNEL_UPDATED', 'chatbot_channel'),
          row(4, 'FORM_PAYMENT_CONFIG_UPDATED', 'form'),
        ],
        pagination: { total: 4, page: 1, pages: 1 },
      },
    });
    render(<AuditLogsPage />);

    const table = await screen.findByRole('table');
    await waitFor(() => expect(table).toHaveTextContent('Tạo landing page'));
    expect(table).toHaveTextContent('Kết nối tài khoản Zalo');
    expect(table).toHaveTextContent('Cập nhật kênh của chatbot');
    expect(table).toHaveTextContent('Cập nhật thanh toán của biểu mẫu');
    expect(table).toHaveTextContent('Tài khoản Zalo');
    expect(table).toHaveTextContent('Kênh của chatbot');
    expect(document.body.textContent).not.toContain('auditLogs.');
  });

  it('mã backend vừa thêm mà CHƯA có nhãn → chữ đọc được, vẫn không lọt khoá dịch', async () => {
    auditLogsApiService.getAuditLogs.mockResolvedValue({
      data: { data: [row(9, 'SOMETHING_BRAND_NEW', 'brand_new_thing')], pagination: { total: 1, page: 1, pages: 1 } },
    });
    render(<AuditLogsPage />);

    const table = await screen.findByRole('table');
    await waitFor(() => expect(table).toHaveTextContent('Something brand new'));
    expect(table).toHaveTextContent('Brand new thing');
    expect(document.body.textContent).not.toContain('auditLogs.');
  });

  it('ô lọc liệt kê được các hành động khách đang có thật, không chỉ 21 mã cũ', async () => {
    auditLogsApiService.getAuditLogs.mockResolvedValue({ data: { data: [], pagination: { total: 0, page: 1, pages: 1 } } });
    render(<AuditLogsPage />);
    await waitFor(() => expect(auditLogsApiService.getAuditLogs).toHaveBeenCalled());

    const options = [...document.querySelectorAll('option')].map((o) => o.textContent);
    for (const label of ['Kết nối tài khoản Zalo', 'Tạo landing page', 'Cập nhật chatbot', 'Thêm khách hàng', 'Tài khoản Zalo', 'Landing page']) {
      expect(options).toContain(label);
    }
    expect(options.some((text) => text.includes('auditLogs.'))).toBe(false);
  });
});
