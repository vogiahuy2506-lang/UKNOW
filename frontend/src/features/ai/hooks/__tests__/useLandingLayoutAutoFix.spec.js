/**
 * PLAN_LANDING_TU_KIEM_HIEN_THI_TU_SUA mục 12.4 — vòng tự kiểm → tự sửa → đo lại.
 * Mock bộ đo (jsdom không có layout) và aiApi; hợp đồng bộ đo: chỉ "sạch" khi findings rỗng VÀ
 * !timedOut VÀ errors rỗng — có timedOut/errors là CHƯA KIỂM ĐƯỢC.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockToast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));
vi.mock('react-hot-toast', () => ({ toast: mockToast, default: mockToast }));
vi.mock('../../../../services/aiApi.js', () => ({ default: { editLandingHtml: vi.fn() } }));
vi.mock('../../utils/layoutAudit.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runLayoutAudit: vi.fn(),
}));

import aiApi from '../../../../services/aiApi.js';
import { runLayoutAudit } from '../../utils/layoutAudit.js';
import { autoFixLandingLayout, useLandingLayoutAutoFix, MAX_AUTO_FIX_ROUNDS } from '../useLandingLayoutAutoFix.js';

const finding = (over = {}) => ({
  kind: 'text_covered', width: 1280, text: '03/02/2026',
  selector: 'span.block.text-lg:nth-of-type(1)',
  coveredBy: { text: '1', selector: 'div.absolute.-left-11:nth-of-type(1)' },
  overlapPx: 12, side: 'right', sectionTitle: 'Dòng thời gian', ...over,
});
const CLEAN = { findings: [], timedOut: false, errors: [] };
const BROKEN = (n = 1) => ({ findings: Array.from({ length: n }, (_, i) => finding({ text: `t${i}` })), timedOut: false, errors: [] });
const page = { title: 'Trang', html: '<div>v0</div>', css: '.x{}' };
const editOk = (html, extra = {}) => ({ success: true, data: { title: 'Trang', html, ...extra } });
const run = (over = {}) => autoFixLandingLayout({ page, sessionId: 55, messageId: 4242, locale: 'vi', ...over });

describe('autoFixLandingLayout', () => {
  let info;
  beforeEach(() => {
    vi.clearAllMocks();
    runLayoutAudit.mockReset();
    aiApi.editLandingHtml.mockReset();
    info = vi.spyOn(console, 'info').mockImplementation(() => {});
  });
  afterEach(() => info.mockRestore());

  it('đo ra sạch ngay → clean, KHÔNG gọi edit', async () => {
    runLayoutAudit.mockResolvedValueOnce(CLEAN);
    const result = await run();
    expect(result).toMatchObject({ status: 'clean', changed: false, findings: [] });
    expect(result.page).toBe(page);
    expect(aiApi.editLandingHtml).not.toHaveBeenCalled();
    expect(runLayoutAudit).toHaveBeenCalledTimes(1);
  });

  it('đo bằng đúng HTML đầy đủ của trang (Tailwind + css), không phải mảnh trần', async () => {
    runLayoutAudit.mockResolvedValueOnce(CLEAN);
    await run();
    const measuredHtml = runLayoutAudit.mock.calls[0][0];
    expect(measuredHtml).toContain('cdn.tailwindcss.com');
    expect(measuredHtml).toContain('<div>v0</div>');
    expect(measuredHtml).toContain('.x{}');
  });

  it('lỗi rồi sạch → ĐÚNG 1 lượt edit tự động (autoLayoutFix + findings + messageId + sessionId), ĐO LẠI, → fixed', async () => {
    const found = BROKEN(2);
    runLayoutAudit.mockResolvedValueOnce(found).mockResolvedValueOnce(CLEAN);
    aiApi.editLandingHtml.mockResolvedValueOnce(editOk('<div>v1</div>', { changeSummary: 'Đã nới cột ngày', canRevert: true }));

    const result = await run();

    expect(aiApi.editLandingHtml).toHaveBeenCalledTimes(1);
    expect(aiApi.editLandingHtml).toHaveBeenCalledWith({
      currentHtml: '<div>v0</div>',
      locale: 'vi',
      sessionId: 55,
      messageId: 4242,
      autoLayoutFix: true,
      layoutFindings: found.findings,
    });
    // đo lại trang MỚI, không đoán
    expect(runLayoutAudit).toHaveBeenCalledTimes(2);
    expect(runLayoutAudit.mock.calls[1][0]).toContain('<div>v1</div>');
    expect(result).toMatchObject({ status: 'fixed', changed: true, changeSummary: 'Đã nới cột ngày', canRevert: true });
    expect(result.page).toMatchObject({ title: 'Trang', html: '<div>v1</div>', css: '.x{}' });
  });

  it('máy đo lại vẫn thấy lỗi → KHÔNG được coi là fixed; đủ 2 vòng rồi dừng → still_broken, KHÔNG vòng 3', async () => {
    runLayoutAudit.mockResolvedValue(BROKEN(1));
    let n = 0;
    aiApi.editLandingHtml.mockImplementation(async () => editOk(`<div>v${++n}</div>`));

    const result = await run();

    expect(MAX_AUTO_FIX_ROUNDS).toBe(2);
    expect(aiApi.editLandingHtml).toHaveBeenCalledTimes(2);
    expect(runLayoutAudit).toHaveBeenCalledTimes(3); // đo đầu + đo lại sau mỗi vòng
    expect(result.status).toBe('still_broken');
    expect(result.findings).toHaveLength(1);
    expect(result.changed).toBe(true);
    expect(result.page.html).toBe('<div>v2</div>');
  });

  it('vòng 1 giảm lỗi, vòng 2 sạch → fixed với 2 lượt edit; findings vòng 2 là findings ĐO LẠI', async () => {
    const first = BROKEN(3);
    const second = BROKEN(1);
    runLayoutAudit.mockResolvedValueOnce(first).mockResolvedValueOnce(second).mockResolvedValueOnce(CLEAN);
    aiApi.editLandingHtml
      .mockResolvedValueOnce(editOk('<div>v1</div>', { changeSummary: 'Vòng một' }))
      .mockResolvedValueOnce(editOk('<div>v2</div>', { changeSummary: 'Vòng hai' }));
    const result = await run();
    expect(aiApi.editLandingHtml.mock.calls[0][0].layoutFindings).toEqual(first.findings);
    expect(aiApi.editLandingHtml.mock.calls[1][0].layoutFindings).toEqual(second.findings);
    expect(aiApi.editLandingHtml.mock.calls[1][0].currentHtml).toBe('<div>v1</div>');
    expect(result).toMatchObject({ status: 'fixed', changeSummary: 'Vòng hai' });
  });

  describe('chưa kiểm được → unknown: KHÔNG ✓, KHÔNG gọi edit', () => {
    it.each([
      ['timedOut', { findings: [], timedOut: true, errors: [] }],
      ['errors scan_incomplete', { findings: [], timedOut: false, errors: ['scan_incomplete'] }],
      ['errors tailwind_not_loaded', { findings: [], timedOut: false, errors: ['tailwind_not_loaded'] }],
      ['timedOut kèm findings một phần', { findings: [finding()], timedOut: true, errors: [] }],
      ['errors kèm findings một phần', { findings: [finding()], timedOut: false, errors: ['scan_incomplete'] }],
    ])('%s', async (_label, audit) => {
      runLayoutAudit.mockResolvedValueOnce(audit);
      const result = await run();
      expect(result.status).toBe('unknown');
      expect(result.changed).toBe(false);
      expect(aiApi.editLandingHtml).not.toHaveBeenCalled();
      expect(mockToast.error).not.toHaveBeenCalled();
    });

    it('bộ đo ném lỗi / không trả gì → unknown, không throw', async () => {
      runLayoutAudit.mockRejectedValueOnce(new Error('boom'));
      await expect(run()).resolves.toMatchObject({ status: 'unknown' });
      runLayoutAudit.mockResolvedValueOnce(undefined);
      await expect(run()).resolves.toMatchObject({ status: 'unknown' });
      expect(aiApi.editLandingHtml).not.toHaveBeenCalled();
    });

    it('đã sửa nhưng lần ĐO LẠI không kiểm được → unknown (không nói "đã sửa"), trang mới vẫn được trả về', async () => {
      runLayoutAudit
        .mockResolvedValueOnce(BROKEN(1))
        .mockResolvedValueOnce({ findings: [], timedOut: false, errors: ['scan_incomplete'] });
      aiApi.editLandingHtml.mockResolvedValueOnce(editOk('<div>v1</div>', { changeSummary: 'x' }));
      const result = await run();
      expect(result.status).toBe('unknown');
      expect(result.changed).toBe(true);
      expect(result.page.html).toBe('<div>v1</div>');
      expect(aiApi.editLandingHtml).toHaveBeenCalledTimes(1);
    });

    it('trang trống → unknown, không đo, không gọi gì', async () => {
      await expect(run({ page: { html: '  ' } })).resolves.toMatchObject({ status: 'unknown' });
      expect(runLayoutAudit).not.toHaveBeenCalled();
    });
  });

  describe('lỗi của lượt tự sửa → dừng IM LẶNG (không toast, không throw)', () => {
    const httpError = (status, code) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data: { code } } });

    it.each([
      ['429 AUTO_LAYOUT_FIX_LIMIT (hết lượt / trang dán HTML chưa được cấp lượt)', httpError(429, 'AUTO_LAYOUT_FIX_LIMIT')],
      ['404 LANDING_MESSAGE_NOT_FOUND', httpError(404, 'LANDING_MESSAGE_NOT_FOUND')],
      ['400 LAYOUT_FINDINGS_REQUIRED', httpError(400, 'LAYOUT_FINDINGS_REQUIRED')],
      ['409', httpError(409, 'NOTHING_TO_REVERT')],
      ['lỗi mạng', new Error('Network Error')],
      ['bị api.js huỷ vì request trùng', Object.assign(new Error('canceled'), { code: 'ERR_CANCELED' })],
    ])('%s', async (_label, error) => {
      runLayoutAudit.mockResolvedValue(BROKEN(2));
      aiApi.editLandingHtml.mockRejectedValueOnce(error);

      const result = await run();

      expect(aiApi.editLandingHtml).toHaveBeenCalledTimes(1); // không thử lại, không vòng 2
      expect(runLayoutAudit).toHaveBeenCalledTimes(1);
      // lỗi đã ĐO THẬT vẫn được báo (để có nút "Trình bày lại"), nhưng KHÔNG nói "đã sửa"
      expect(result).toMatchObject({ status: 'still_broken', changed: false });
      expect(result.findings).toHaveLength(2);
      expect(mockToast.error).not.toHaveBeenCalled();
      expect(mockToast.success).not.toHaveBeenCalled();
    });

    it('429 ở vòng 2 (sau khi vòng 1 đã sửa một phần) → still_broken, giữ trang đã sửa, findings mới nhất', async () => {
      const second = BROKEN(1);
      runLayoutAudit.mockResolvedValueOnce(BROKEN(3)).mockResolvedValueOnce(second);
      aiApi.editLandingHtml
        .mockResolvedValueOnce(editOk('<div>v1</div>'))
        .mockRejectedValueOnce(httpError(429, 'AUTO_LAYOUT_FIX_LIMIT'));
      const result = await run();
      expect(aiApi.editLandingHtml).toHaveBeenCalledTimes(2);
      expect(result).toMatchObject({ status: 'still_broken', changed: true });
      expect(result.findings).toEqual(second.findings);
      expect(result.page.html).toBe('<div>v1</div>');
      expect(mockToast.error).not.toHaveBeenCalled();
    });

    it('server trả success:false / html rỗng / html không đổi → dừng, không vòng thừa', async () => {
      runLayoutAudit.mockResolvedValue(BROKEN(1));
      for (const response of [{ success: false, message: 'x' }, editOk('   '), editOk('<div>v0</div>'), undefined]) {
        aiApi.editLandingHtml.mockReset();
        aiApi.editLandingHtml.mockResolvedValueOnce(response);
        const result = await run();
        expect(aiApi.editLandingHtml).toHaveBeenCalledTimes(1);
        expect(result.status).toBe('still_broken');
        expect(result.changed).toBe(false);
      }
    });
  });

  it('không có sessionId → không thể tự sửa (server đếm trần theo phiên): báo lỗi đã đo, KHÔNG gọi edit', async () => {
    runLayoutAudit.mockResolvedValueOnce(BROKEN(2));
    const result = await run({ sessionId: null });
    expect(result).toMatchObject({ status: 'still_broken' });
    expect(aiApi.editLandingHtml).not.toHaveBeenCalled();
  });

  it('allowAutoFix=false (trang dán HTML) → CHỈ ĐO: có lỗi thì still_broken kèm findings, KHÔNG gọi edit', async () => {
    runLayoutAudit.mockResolvedValueOnce(BROKEN(3));
    const result = await run({ allowAutoFix: false });
    expect(result).toMatchObject({ status: 'still_broken', changed: false });
    expect(result.findings).toHaveLength(3);
    expect(aiApi.editLandingHtml).not.toHaveBeenCalled();
    expect(runLayoutAudit).toHaveBeenCalledTimes(1);
  });

  it('allowAutoFix=false mà trang sạch → clean (vẫn hiện ✓ cho trang dán)', async () => {
    runLayoutAudit.mockResolvedValueOnce(CLEAN);
    const result = await run({ allowAutoFix: false });
    expect(result).toMatchObject({ status: 'clean' });
    expect(aiApi.editLandingHtml).not.toHaveBeenCalled();
  });

  it('messageId null vẫn tự sửa được (server lấy tin landing mới nhất)', async () => {
    runLayoutAudit.mockResolvedValueOnce(BROKEN(1)).mockResolvedValueOnce(CLEAN);
    aiApi.editLandingHtml.mockResolvedValueOnce(editOk('<div>v1</div>'));
    const result = await run({ messageId: null });
    expect(aiApi.editLandingHtml.mock.calls[0][0].messageId).toBeNull();
    expect(result.status).toBe('fixed');
  });

  it('bị thay thế (isCancelled) → dừng NGAY: không gọi thêm request nào', async () => {
    runLayoutAudit.mockResolvedValue(BROKEN(1));
    const result = await run({ isCancelled: () => true });
    expect(result.cancelled).toBe(true);
    expect(result.status).toBe('unknown');
    expect(aiApi.editLandingHtml).not.toHaveBeenCalled();
  });

  it('bị thay thế GIỮA vòng (sau khi edit trả về) → không đo lại, không vòng 2', async () => {
    let cancelled = false;
    runLayoutAudit.mockResolvedValue(BROKEN(1));
    aiApi.editLandingHtml.mockImplementationOnce(async () => {
      cancelled = true;
      return editOk('<div>v1</div>');
    });
    const result = await run({ isCancelled: () => cancelled });
    expect(result.cancelled).toBe(true);
    expect(aiApi.editLandingHtml).toHaveBeenCalledTimes(1);
    expect(runLayoutAudit).toHaveBeenCalledTimes(1);
  });

  it('useLandingLayoutAutoFix: runAutoFix ổn định giữa các lần render và chạy đúng vòng trên', async () => {
    runLayoutAudit.mockResolvedValueOnce(CLEAN);
    const { result, rerender } = renderHook(() => useLandingLayoutAutoFix());
    const first = result.current.runAutoFix;
    rerender();
    expect(result.current.runAutoFix).toBe(first);
    await expect(first({ page, sessionId: 55 })).resolves.toMatchObject({ status: 'clean' });
  });
});
