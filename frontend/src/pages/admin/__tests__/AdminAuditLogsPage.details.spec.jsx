/**
 * Nhật ký hệ thống (quản trị): cột Chi tiết dễ đọc, nhưng quản trị cần xem dữ liệu gốc khi điều tra.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AdminAuditLogsPage from '../AdminAuditLogsPage';
import adminAuditLogsApiService from '../../../features/admin/services/adminAuditLogsApi.service';
import viTranslations from '../../../i18n/vi';

vi.mock('../../../features/admin/services/adminAuditLogsApi.service', () => ({
  default: { getAuditLogs: vi.fn() },
}));
const mockT = (key) => key.split('.').reduce((acc, part) => acc?.[part], viTranslations) ?? key;
vi.mock('../../../i18n', () => ({ useI18n: () => ({ t: mockT, locale: 'vi' }) }));

const rows = [
  {
    id: 1, action: 'USER_PLAN_CHANGED', entity_type: 'user', entity_id: 4, created_at: '2026-09-20T09:00:00Z',
    details: { expiresAt: '2026-10-17T18:00:00.000Z', planCode: 'trial', source: 'signup_auto_trial' },
    actor_name: null, actor_username: null, actor_email: null, ip_address: '1.2.3.4',
  },
  {
    id: 2, action: 'PLAN_UPDATED', entity_type: 'plan', entity_id: 2, created_at: '2026-09-20T09:00:00Z',
    details: { name: 'Pro' }, actor_name: 'Quản trị', actor_username: 'admin', actor_email: 'ad@x.vn', ip_address: null,
  },
];

describe('AdminAuditLogsPage — cột Chi tiết', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminAuditLogsApiService.getAuditLogs.mockResolvedValue({ data: { data: rows, pagination: { total: 2, page: 1, pages: 1 } } });
  });

  it('hiện câu đã dịch; người thực hiện NULL → "Hệ thống (tự động)"', async () => {
    render(<AdminAuditLogsPage />);
    const table = await screen.findByRole('table');
    await waitFor(() => expect(table).toHaveTextContent('Gói Dùng thử · Hết hạn 18/10/2026 · Tự cấp khi đăng ký'));
    expect(table).toHaveTextContent('"Pro"');
    expect(table).toHaveTextContent('Hệ thống (tự động)');
    expect(table.textContent).not.toMatch(/expiresAt|planCode|signup_auto_trial|auditLogs\./);
  });

  it('có nút "Xem dữ liệu gốc" mở JSON đầy đủ của dòng, và đóng được', async () => {
    render(<AdminAuditLogsPage />);
    const buttons = await screen.findAllByText('Xem dữ liệu gốc');
    expect(buttons).toHaveLength(2);

    fireEvent.click(buttons[0]);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('"planCode": "trial"');
    expect(dialog).toHaveTextContent('"source": "signup_auto_trial"');

    fireEvent.click(screen.getByText('Đóng'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
