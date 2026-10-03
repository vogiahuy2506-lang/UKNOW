/**
 * Cột "Chi tiết" và "Người thực hiện" của trang Nhật ký hoạt động (chủ tài khoản).
 *
 * Trước 04/10/2026 cột Chi tiết in `nodesSau: 2, nodesTruoc: 0` / `slug: null, isPublished: false` và thao tác
 * tự động (id_user NULL — vd hệ thống tự tắt lịch chạy) hiện "—" ở cột người thực hiện.
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

const row = (id, action, entityType, details, actor = { actor_name: 'Chủ Shop', actor_username: 'chushop' }) => ({
  id, action, entity_type: entityType, entity_id: id, details, created_at: '2026-09-20T09:00:00Z', ...actor,
});

describe('AuditLogsPage — cột Chi tiết và Người thực hiện', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hiện câu đã dịch, không lộ tên khoá kỹ thuật hay JSON; không có nút xem dữ liệu gốc', async () => {
    auditLogsApiService.getAuditLogs.mockResolvedValue({
      data: {
        data: [
          row(1, 'CAMPAIGN_UPDATED', 'campaign', { nodesSau: 2, nodesTruoc: 0 }),
          row(2, 'LANDING_PAGE_CREATED', 'landing_page', { slug: null, title: '1', isPublished: false }),
          row(3, 'EMPLOYEE_PERMISSIONS_UPDATED', 'employee', { permissions: { forms: true, customers: true } }),
        ],
        pagination: { total: 3, page: 1, pages: 1 },
      },
    });
    render(<AuditLogsPage />);

    const table = await screen.findByRole('table');
    await waitFor(() => expect(table).toHaveTextContent('Số bước: 0 → 2'));
    expect(table).toHaveTextContent('Tiêu đề "1" · Chưa xuất bản');
    expect(table).toHaveTextContent('Được phép: Biểu mẫu thu thập, Khách hàng');
    const text = document.body.textContent;
    expect(text).not.toMatch(/nodesSau|nodesTruoc|slug:|isPublished|"forms"|JSON/);
    expect(screen.queryByText('Xem dữ liệu gốc')).toBeNull();
  });

  it('thao tác tự động (không có người thực hiện) hiện "Hệ thống (tự động)" thay cho "—"', async () => {
    auditLogsApiService.getAuditLogs.mockResolvedValue({
      data: {
        data: [
          row(7, 'CAMPAIGN_SCHEDULE_TOGGLED', 'campaign',
            { scheduleId: 5, enabled: false, automatic: true, reason: 'Zalo chưa đăng nhập' },
            { actor_name: null, actor_username: null }),
        ],
        pagination: { total: 1, page: 1, pages: 1 },
      },
    });
    render(<AuditLogsPage />);

    const table = await screen.findByRole('table');
    await waitFor(() => expect(table).toHaveTextContent('Hệ thống (tự động)'));
    expect(table).toHaveTextContent('Hệ thống tự tắt lịch sau nhiều lần chạy lỗi · Lỗi gần đây: Zalo chưa đăng nhập');
  });
});
