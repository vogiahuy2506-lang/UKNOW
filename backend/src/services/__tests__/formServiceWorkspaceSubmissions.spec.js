import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const listSubmissionsByWorkspace = jest.fn();

jest.unstable_mockModule('../../repositories/form.repository.js', () => ({
  default: { listSubmissionsByWorkspace },
  MAX_FORM_RESPONDENT_EMAILS_PER_24H: 100,
  MAX_CONFIRMATION_EMAILS_PER_RECIPIENT_PER_24H: 10,
}));

const { default: formService } = await import('../form.service.js');

beforeEach(() => {
  listSubmissionsByWorkspace.mockReset().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
});

describe('form.service listWorkspaceSubmissions (màn "Khách để lại thông tin" → tab Từ biểu mẫu)', () => {
  it('không có tham số lọc → giao repository đúng workspace, mọi bộ lọc null', async () => {
    const result = await formService.listWorkspaceSubmissions(5, {});

    expect(result).toEqual({ items: [], total: 0, page: 1, limit: 20 });
    expect(listSubmissionsByWorkspace).toHaveBeenCalledTimes(1);
    expect(listSubmissionsByWorkspace).toHaveBeenCalledWith(5, {
      page: undefined,
      limit: undefined,
      formId: null,
      landingPageSlug: null,
      from: null,
      to: null,
    });
  });

  it('chuỗi rỗng từ ô lọc để trống = không lọc', async () => {
    await formService.listWorkspaceSubmissions(5, { formId: '', from: '', to: '', landingPageSlug: '' });

    expect(listSubmissionsByWorkspace.mock.calls[0][1]).toMatchObject({
      formId: null,
      from: null,
      to: null,
      landingPageSlug: null,
    });
  });

  it('chuẩn hoá: formId thành số nguyên, slug về dạng lưu (chữ thường, bỏ "/" đầu cuối)', async () => {
    await formService.listWorkspaceSubmissions(5, {
      page: '2',
      limit: '10',
      formId: '42',
      landingPageSlug: ' /Khoa-Hoc/ ',
      from: '2026-10-01',
      to: '2026-10-31',
    });

    expect(listSubmissionsByWorkspace).toHaveBeenCalledWith(5, {
      page: '2',
      limit: '10',
      formId: 42,
      landingPageSlug: 'khoa-hoc',
      from: '2026-10-01',
      to: '2026-10-31',
    });
  });

  it.each([['abc'], ['0'], ['-3'], ['12abc'], ['1.5'], [['1', '2']]])(
    'formId %p không hợp lệ → 400 INVALID_FORM_ID, không chạm repository',
    async (formId) => {
      await expect(formService.listWorkspaceSubmissions(5, { formId })).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_FORM_ID',
      });
      expect(listSubmissionsByWorkspace).not.toHaveBeenCalled();
    }
  );

  it.each([
    [{ from: 'abc' }],
    [{ to: '2026-13-01' }],
    [{ from: '2026-02-31' }],
    [{ from: '01/10/2026' }],
    [{ from: ['2026-10-01'] }],
  ])('ngày sai định dạng %j → 400 INVALID_DATE', async (query) => {
    await expect(formService.listWorkspaceSubmissions(5, query)).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_DATE',
    });
    expect(listSubmissionsByWorkspace).not.toHaveBeenCalled();
  });

  it('from sau to → 400 INVALID_DATE_RANGE; from = to hợp lệ (một ngày)', async () => {
    await expect(
      formService.listWorkspaceSubmissions(5, { from: '2026-10-05', to: '2026-10-01' })
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_DATE_RANGE' });
    expect(listSubmissionsByWorkspace).not.toHaveBeenCalled();

    await formService.listWorkspaceSubmissions(5, { from: '2026-10-05', to: '2026-10-05' });
    expect(listSubmissionsByWorkspace).toHaveBeenCalledTimes(1);
  });

  it('landingPageSlug không phải chuỗi (mảng) → bỏ qua bộ lọc thay vì làm hỏng truy vấn', async () => {
    await formService.listWorkspaceSubmissions(5, { landingPageSlug: ['a', 'b'] });

    expect(listSubmissionsByWorkspace.mock.calls[0][1].landingPageSlug).toBeNull();
  });
});
