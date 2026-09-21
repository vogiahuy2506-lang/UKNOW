/**
 * Lệnh giao 21/09/2026, PR-2 Việc 2.2 — 4 action nhật ký lịch chạy mới phải có nhãn tiếng người ở cả
 * dòng nhật ký lẫn ô lọc; thiếu nhãn thì t() trả về chuỗi khoá trần "auditLogs.actions.…".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import AuditLogsPage from '../AuditLogsPage';
import auditLogsApiService from '../../../features/settings/services/auditLogsApi.service';
import viTranslations from '../../../i18n/vi';
import enTranslations from '../../../i18n/en';

vi.mock('../../../features/settings/services/auditLogsApi.service', () => ({
  default: { getAuditLogs: vi.fn() },
}));

const makeT = (dict) => (key) => key.split('.').reduce((acc, part) => acc?.[part], dict) ?? key;
vi.mock('../../../i18n', () => ({ useI18n: () => ({ t: mockT }) }));
let mockT = makeT(viTranslations);

const ACTIONS = [
  'CAMPAIGN_SCHEDULE_CREATED',
  'CAMPAIGN_SCHEDULE_UPDATED',
  'CAMPAIGN_SCHEDULE_TOGGLED',
  'CAMPAIGN_SCHEDULE_DELETED',
];

describe('nhãn action nhật ký lịch chạy', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(ACTIONS)('%s có nhãn ở từ điển vi và en (không phải khoá trần)', (action) => {
    expect(typeof viTranslations.auditLogs.actions[action]).toBe('string');
    expect(typeof enTranslations.auditLogs.actions[action]).toBe('string');
    expect(viTranslations.auditLogs.actions[action]).not.toContain('auditLogs.');
  });

  it('bản vi: tên đúng và bật/tắt tách riêng khỏi sửa', () => {
    const vi_ = viTranslations.auditLogs.actions;
    expect(vi_.CAMPAIGN_SCHEDULE_CREATED).toBe('Tạo lịch chạy chiến dịch');
    expect(vi_.CAMPAIGN_SCHEDULE_TOGGLED).toBe('Bật/tắt lịch chạy chiến dịch');
    expect(new Set(ACTIONS.map((a) => vi_[a])).size).toBe(4);
  });

  it('ô lọc hành động liệt kê cả 4 action mới', async () => {
    auditLogsApiService.getAuditLogs.mockResolvedValue({ data: { data: [], pagination: { total: 0, page: 1, pages: 1 } } });
    render(<AuditLogsPage />);
    await waitFor(() => expect(auditLogsApiService.getAuditLogs).toHaveBeenCalled());
    const optionTexts = [...document.querySelectorAll('option')].map((o) => o.textContent);
    for (const label of ['Tạo lịch chạy chiến dịch', 'Sửa lịch chạy chiến dịch', 'Bật/tắt lịch chạy chiến dịch', 'Xóa lịch chạy chiến dịch']) {
      expect(optionTexts).toContain(label);
    }
  });
});
