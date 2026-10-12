import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * PR-8c — ba hàm gọi API xuất CSV: đúng đường dẫn, đúng tham số lọc (chỉ gửi khoá có giá trị), responseType blob + timeout dài.
 */
const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: { get: mocks.get } }));

import { exportWorkspaceSubmissionsCsv, exportFormSubmissionsCsv } from '../services/formAdminApi.service';
import { exportLandingLeadsAdminCsv } from '../../landing/services/landingLeadsAdminApi.service';
import { CSV_EXPORT_TIMEOUT_MS } from '../../../utils/csvExportDownload';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue({ data: new Blob(['x']), headers: {} });
});

describe('exportWorkspaceSubmissionsCsv', () => {
  it('GET /forms/submissions/export.csv với đủ bộ lọc, blob + timeout dài', async () => {
    await exportWorkspaceSubmissionsCsv({ formId: 8, landingPageSlug: 'khoa-hoc', from: '2026-10-01', to: '2026-10-05', lang: 'en' });
    expect(mocks.get).toHaveBeenCalledWith('/forms/submissions/export.csv', {
      params: { formId: 8, landingPageSlug: 'khoa-hoc', from: '2026-10-01', to: '2026-10-05', lang: 'en' },
      responseType: 'blob',
      timeout: CSV_EXPORT_TIMEOUT_MS,
    });
  });

  it('không có bộ lọc → không gửi khoá nào (không gửi "formId=")', async () => {
    await exportWorkspaceSubmissionsCsv();
    expect(mocks.get.mock.calls[0][1].params).toEqual({});
    await exportWorkspaceSubmissionsCsv({ formId: '', from: '', to: undefined, lang: 'vi' });
    expect(mocks.get.mock.calls[1][1].params).toEqual({ lang: 'vi' });
  });
});

describe('exportFormSubmissionsCsv', () => {
  it('GET /forms/:id/submissions/export.csv kèm date + lang', async () => {
    await exportFormSubmissionsCsv(7, { date: '2026-10-14', lang: 'vi' });
    expect(mocks.get).toHaveBeenCalledWith('/forms/7/submissions/export.csv', {
      params: { date: '2026-10-14', lang: 'vi' },
      responseType: 'blob',
      timeout: CSV_EXPORT_TIMEOUT_MS,
    });
  });

  it('không lọc ngày → params rỗng', async () => {
    await exportFormSubmissionsCsv(7);
    expect(mocks.get.mock.calls[0][1].params).toEqual({});
  });
});

describe('exportLandingLeadsAdminCsv', () => {
  it('GET /leads/export.csv dùng CÙNG bộ tham số lọc với danh sách (không phân trang) + lang', async () => {
    await exportLandingLeadsAdminCsv(
      {
        landingLeadsUseDateRange: true,
        landingLeadsDateFrom: '2026-10-01',
        landingLeadsDateTo: '2026-10-05',
        landingLeadsOccupations: ['dev'],
        landingLeadsInterests: [],
        landingLeadsSlugs: ['home'],
        landingLeadsCustomFilters: [],
        page: 3,
        pageSize: 20,
      },
      'vi'
    );
    const [url, config] = mocks.get.mock.calls[0];
    expect(url).toBe('/leads/export.csv');
    expect(config.responseType).toBe('blob');
    expect(config.timeout).toBe(CSV_EXPORT_TIMEOUT_MS);
    expect(config.params).toEqual({
      landingLeadsUseDateRange: 'true',
      landingLeadsDateFrom: '2026-10-01',
      landingLeadsDateTo: '2026-10-05',
      landingLeadsOccupations: '["dev"]',
      landingLeadsInterests: '[]',
      landingLeadsSlugs: '["home"]',
      landingLeadsCustomFilters: '[]',
      lang: 'vi',
    });
    expect(config.params).not.toHaveProperty('page');
    expect(config.params).not.toHaveProperty('pageSize');
  });
});
