import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../../services/api.js', () => ({
  default: {
    get: vi.fn(),
  },
}));

import api from '../../../../services/api.js';
import {
  fetchLandingLeadsAdminList,
  downloadLandingLeadsAdminExportXlsx,
} from '../landingLeadsAdminApi.service.js';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchLandingLeadsAdminList — buildLandingLeadsFilterQuery', () => {
  it('success=true + data → trả về data; query normalize đầy đủ', async () => {
    api.get.mockResolvedValueOnce({
      data: { success: true, data: { items: [{ id: 1 }], pagination: { total: 1 } } },
    });

    const out = await fetchLandingLeadsAdminList({
      page: 2,
      pageSize: 30,
      landingLeadsUseDateRange: true,
      landingLeadsDateFrom: '2026-01-01',
      landingLeadsDateTo: '2026-01-31',
      landingLeadsOccupations: ['student', 'teacher'],
      landingLeadsInterests: ['ai'],
      landingLeadsSlugs: ['founder-ai'],
    });

    expect(out).toEqual({ items: [{ id: 1 }], pagination: { total: 1 } });
    const params = api.get.mock.calls[0][1].params;
    expect(params.page).toBe(2);
    expect(params.pageSize).toBe(30);
    expect(params.landingLeadsUseDateRange).toBe('true');
    expect(params.landingLeadsDateFrom).toBe('2026-01-01');
    expect(params.landingLeadsDateTo).toBe('2026-01-31');
    expect(JSON.parse(params.landingLeadsOccupations)).toEqual(['student', 'teacher']);
    expect(JSON.parse(params.landingLeadsInterests)).toEqual(['ai']);
    expect(JSON.parse(params.landingLeadsSlugs)).toEqual(['founder-ai']);
  });

  it('useDateRange="1"/"true" → "true"; falsy → "false"', async () => {
    api.get.mockResolvedValue({ data: { success: true, data: { items: [], pagination: {} } } });
    await fetchLandingLeadsAdminList({ landingLeadsUseDateRange: '1' });
    await fetchLandingLeadsAdminList({ landingLeadsUseDateRange: 'true' });
    await fetchLandingLeadsAdminList({ landingLeadsUseDateRange: false });
    expect(api.get.mock.calls[0][1].params.landingLeadsUseDateRange).toBe('true');
    expect(api.get.mock.calls[1][1].params.landingLeadsUseDateRange).toBe('true');
    expect(api.get.mock.calls[2][1].params.landingLeadsUseDateRange).toBe('false');
  });

  it('arrays missing/không phải array → JSON "[]", date strings rỗng', async () => {
    api.get.mockResolvedValueOnce({ data: { success: true, data: { items: [], pagination: {} } } });
    await fetchLandingLeadsAdminList({
      landingLeadsOccupations: null,
      landingLeadsInterests: 'oops',
      landingLeadsSlugs: undefined,
    });
    const params = api.get.mock.calls[0][1].params;
    expect(params.landingLeadsOccupations).toBe('[]');
    expect(params.landingLeadsInterests).toBe('[]');
    expect(params.landingLeadsSlugs).toBe('[]');
    expect(params.landingLeadsDateFrom).toBe('');
    expect(params.landingLeadsDateTo).toBe('');
    expect(params.page).toBe(1);
    expect(params.pageSize).toBe(20);
  });

  it('success=false → throw kèm message server', async () => {
    api.get.mockResolvedValueOnce({ data: { success: false, message: 'Bad filter' } });
    await expect(fetchLandingLeadsAdminList({})).rejects.toThrow('Bad filter');
  });

  it('success=false không message → throw fallback', async () => {
    api.get.mockResolvedValueOnce({ data: { success: false } });
    await expect(fetchLandingLeadsAdminList({})).rejects.toThrow('Không tải được danh sách');
  });
});

describe('downloadLandingLeadsAdminExportXlsx', () => {
  let createObjectURLSpy;
  let revokeObjectURLSpy;
  let appendSpy;
  let removeSpy;
  let clickSpy;

  beforeEach(() => {
    createObjectURLSpy = vi.fn(() => 'blob:test-url');
    revokeObjectURLSpy = vi.fn();
    if (!URL.createObjectURL) URL.createObjectURL = createObjectURLSpy;
    if (!URL.revokeObjectURL) URL.revokeObjectURL = revokeObjectURLSpy;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(createObjectURLSpy);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeObjectURLSpy);
    clickSpy = vi.fn();
    appendSpy = vi.spyOn(document.body, 'appendChild');
    removeSpy = vi.spyOn(HTMLAnchorElement.prototype, 'remove');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(clickSpy);
  });

  it('xlsx response → tạo anchor, click, revokeURL, trả truncated=false', async () => {
    const blob = new Blob(['xlsx-bytes'], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    api.get.mockResolvedValueOnce({
      data: blob,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': 'attachment; filename="leads-2026-01.xlsx"',
        'x-export-truncated': 'false',
      },
    });

    const out = await downloadLandingLeadsAdminExportXlsx({});
    expect(out).toEqual({ truncated: false });
    expect(api.get).toHaveBeenCalledWith(
      '/leads/export',
      expect.objectContaining({ responseType: 'blob', timeout: 120000 })
    );
    expect(clickSpy).toHaveBeenCalled();
    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:test-url');
    expect(appendSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();
  });

  it('header x-export-truncated="true" → truncated=true', async () => {
    const blob = new Blob(['x'], { type: 'application/octet-stream' });
    api.get.mockResolvedValueOnce({
      data: blob,
      headers: { 'content-type': 'application/octet-stream', 'x-export-truncated': 'true' },
    });
    const out = await downloadLandingLeadsAdminExportXlsx({});
    expect(out).toEqual({ truncated: true });
  });

  it('không có content-disposition → fallback filename "landing-leads.xlsx"', async () => {
    const blob = new Blob(['x'], { type: 'application/octet-stream' });
    api.get.mockResolvedValueOnce({
      data: blob,
      headers: { 'content-type': 'application/octet-stream' },
    });
    const setAttrSpy = vi.spyOn(HTMLAnchorElement.prototype, 'setAttribute');
    await downloadLandingLeadsAdminExportXlsx({});
    expect(clickSpy).toHaveBeenCalled();
    setAttrSpy.mockRestore();
  });

  it('content-type application/json (lỗi server) → parse blob và throw message', async () => {
    const jsonBlob = new Blob([JSON.stringify({ message: 'Quá giới hạn' })], {
      type: 'application/json',
    });
    api.get.mockResolvedValueOnce({
      data: jsonBlob,
      headers: { 'content-type': 'application/json' },
    });
    await expect(downloadLandingLeadsAdminExportXlsx({})).rejects.toThrow('Quá giới hạn');
  });

  it('axios throw kèm response.data Blob json → parse + throw message', async () => {
    const errBlob = new Blob([JSON.stringify({ message: 'Timeout' })], {
      type: 'application/json',
    });
    const err = new Error('boom');
    err.response = { data: errBlob };
    api.get.mockRejectedValueOnce(err);
    await expect(downloadLandingLeadsAdminExportXlsx({})).rejects.toThrow('Timeout');
  });

  it('axios throw không phải Blob → rethrow nguyên error gốc', async () => {
    const err = new Error('network down');
    api.get.mockRejectedValueOnce(err);
    await expect(downloadLandingLeadsAdminExportXlsx({})).rejects.toThrow('network down');
  });

  it('export không gắn page/pageSize trong query', async () => {
    const blob = new Blob(['x'], { type: 'application/octet-stream' });
    api.get.mockResolvedValueOnce({
      data: blob,
      headers: { 'content-type': 'application/octet-stream' },
    });
    await downloadLandingLeadsAdminExportXlsx({ page: 9, pageSize: 99, landingLeadsDateFrom: '2026' });
    const params = api.get.mock.calls[0][1].params;
    expect(params.page).toBeUndefined();
    expect(params.pageSize).toBeUndefined();
    expect(params.landingLeadsDateFrom).toBe('2026');
  });
});
