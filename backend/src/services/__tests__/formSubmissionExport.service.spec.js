import { describe, it, expect, jest, beforeEach } from '@jest/globals';

/**
 * Kế hoạch xuất CSV bài nộp biểu mẫu (PR-8c): bộ lọc, tiêu đề cột, ánh xạ dòng, cắt trần. Repository được giả ở ranh giới
 * (hình dạng đúng như SQL trả về); SQL thật được kiểm ở tests/integration/formSubmissionExport.test.js.
 */
const repo = {
  listSubmissionIdsForExport: jest.fn(),
  listFormsForExport: jest.fn(),
  listAnswerKeysForExport: jest.fn(),
  summarizeSubmissionIdsForExport: jest.fn(),
  findSubmissionsForExport: jest.fn(),
};
jest.unstable_mockModule('../../repositories/formSubmissionExport.repository.js', () => ({ default: repo }));

const { prepareWorkspaceSubmissionsExport, prepareFormSubmissionsExport } = await import('../formSubmissionExport.service.js');

const NOW = new Date('2026-10-12T17:30:00.000Z'); // 00:30 ngày 13/10 giờ VN

const FORM_A = {
  id: '1',
  title: 'Đăng ký học',
  fields: [
    { key: 'a_name', type: 'short_text', label: 'Họ tên' },
    { key: 'a_head', type: 'heading', label: 'Phần 2' },
    { key: 'a_rate', type: 'rating', label: 'Hài lòng' },
    { key: 'a_ok', type: 'yes_no', label: 'Đồng ý liên hệ' },
    { key: 'a_file', type: 'file', label: 'Hồ sơ' },
  ],
  bookingConfig: null,
  paymentConfig: null,
};
const FORM_B = {
  id: '2',
  title: 'Khảo sát',
  fields: [{ key: 'b_name', type: 'short_text', label: 'Họ tên' }],
  bookingConfig: null,
  paymentConfig: null,
};

function row(overrides = {}) {
  return {
    id: '10',
    formId: '1',
    formTitle: 'Đăng ký học',
    respondentName: 'Nguyễn An',
    respondentEmail: 'an@x.vn',
    respondentPhone: '0901234567',
    status: 'submitted',
    holdExpiresAt: null,
    marketingConsent: true,
    consentWithdrawnAt: null,
    landingPageSlug: 'khoa-hoc',
    utmSource: 'fb',
    utmMedium: null,
    utmCampaign: null,
    utmContent: null,
    utmTerm: null,
    appointmentAt: null,
    paymentCode: null,
    paymentAmount: null,
    createdAt: '2026-10-12T17:30:00.000Z',
    answers: {
      a_name: { label: 'Họ tên', type: 'short_text', value: 'Nguyễn An' },
      a_rate: { label: 'Hài lòng', type: 'rating', value: 4 },
      a_ok: { label: 'Đồng ý liên hệ', type: 'yes_no', value: 'yes' },
      a_file: { label: 'Hồ sơ', type: 'file', value: ['cv.pdf'], files: [{ name: 'cv.pdf', storageKey: 'uploads/1/x' }], fileStatus: 'received' },
    },
    ...overrides,
  };
}

beforeEach(() => {
  for (const fn of Object.values(repo)) fn.mockReset();
  repo.listSubmissionIdsForExport.mockResolvedValue({ ids: ['10'], total: 1 });
  repo.summarizeSubmissionIdsForExport.mockResolvedValue({ formIds: ['1'], hasAppointment: false, hasPayment: false });
  repo.listFormsForExport.mockResolvedValue([FORM_A]);
  repo.listAnswerKeysForExport.mockResolvedValue([]);
});

describe('prepareWorkspaceSubmissionsExport — tab "Từ biểu mẫu"', () => {
  it('tiêu đề: cột cố định (thời gian, biểu mẫu, người nộp, email, SĐT, nguồn landing, UTM, trạng thái, đồng ý) + cột câu trả lời theo NHÃN, không có khối hiển thị', async () => {
    const plan = await prepareWorkspaceSubmissionsExport(7, {}, { now: NOW });
    expect(plan.headerCells).toEqual([
      'Thời gian', 'Biểu mẫu', 'Người nộp', 'Email', 'Số điện thoại', 'Nguồn landing',
      'UTM source', 'UTM medium', 'UTM campaign', 'UTM content', 'UTM term', 'Trạng thái', 'Đồng ý nhận tin',
      'Họ tên', 'Hài lòng', 'Đồng ý liên hệ', 'Hồ sơ',
    ]);
    expect(plan.headerCells).not.toContain('Phần 2');
  });

  it('tên tệp: khach-de-lai-thong-tin-bieu-mau-<YYYYMMDD-HHmm giờ VN>.csv', async () => {
    const plan = await prepareWorkspaceSubmissionsExport(7, {}, { now: NOW });
    expect(plan.filename).toBe('khach-de-lai-thong-tin-bieu-mau-20261013-0030.csv');
  });

  it('dòng: giờ VN, trạng thái tiếng Việt, đồng ý Có, rating "4/5", yes_no Có, tệp chỉ tên', async () => {
    const plan = await prepareWorkspaceSubmissionsExport(7, {}, { now: NOW });
    const cells = plan.toCells(row());
    expect(cells).toEqual([
      '13/10/2026 00:30', 'Đăng ký học', 'Nguyễn An', 'an@x.vn', '0901234567', 'khoa-hoc',
      'fb', null, null, null, null, 'Đã nhận', 'Có',
      'Nguyễn An', '4/5', 'Có', 'cv.pdf',
    ]);
  });

  it('nhiều biểu mẫu: nhãn trùng thêm tên biểu mẫu; cột của biểu mẫu khác để trống', async () => {
    repo.summarizeSubmissionIdsForExport.mockResolvedValue({ formIds: ['1', '2'], hasAppointment: false, hasPayment: false });
    repo.listFormsForExport.mockResolvedValue([FORM_A, FORM_B]);
    const plan = await prepareWorkspaceSubmissionsExport(7, {}, { now: NOW });
    const answerHeaders = plan.headerCells.slice(13);
    expect(answerHeaders).toEqual(['Họ tên (Đăng ký học)', 'Hài lòng', 'Đồng ý liên hệ', 'Hồ sơ', 'Họ tên (Khảo sát)']);

    const bRow = row({
      id: '11', formId: '2', formTitle: 'Khảo sát',
      answers: { b_name: { label: 'Họ tên', type: 'short_text', value: 'Trần Bình' } },
    });
    const cells = plan.toCells(bRow).slice(13);
    expect(cells).toEqual(['', '', '', '', 'Trần Bình']);
  });

  it('hold_expired: giữ chỗ quá hạn hiện "Hết hạn thanh toán", còn hạn hiện "Chờ thanh toán"', async () => {
    const plan = await prepareWorkspaceSubmissionsExport(7, {}, { now: NOW });
    const statusIndex = plan.headerCells.indexOf('Trạng thái');
    expect(plan.toCells(row({ status: 'pending_payment', holdExpiresAt: '2026-10-12T17:00:00.000Z' }))[statusIndex]).toBe('Hết hạn thanh toán');
    expect(plan.toCells(row({ status: 'pending_payment', holdExpiresAt: '2026-10-12T18:00:00.000Z' }))[statusIndex]).toBe('Chờ thanh toán');
    expect(plan.toCells(row({ status: 'cancelled' }))[statusIndex]).toBe('Đã huỷ');
  });

  it('đồng ý: true Có · false Không · null Chưa hỏi · đã rút lại Đã rút lại', async () => {
    const plan = await prepareWorkspaceSubmissionsExport(7, {}, { now: NOW });
    const idx = plan.headerCells.indexOf('Đồng ý nhận tin');
    expect(plan.toCells(row({ marketingConsent: false }))[idx]).toBe('Không');
    expect(plan.toCells(row({ marketingConsent: null }))[idx]).toBe('Chưa hỏi');
    expect(plan.toCells(row({ marketingConsent: true, consentWithdrawnAt: '2026-10-12T00:00:00.000Z' }))[idx]).toBe('Đã rút lại');
  });

  it('lang=en: tiêu đề, trạng thái, Yes/No bằng tiếng Anh', async () => {
    const plan = await prepareWorkspaceSubmissionsExport(7, {}, { now: NOW, lang: 'en' });
    expect(plan.headerCells.slice(0, 3)).toEqual(['Time', 'Form', 'Respondent']);
    const cells = plan.toCells(row());
    expect(cells[plan.headerCells.indexOf('Status')]).toBe('Received');
    expect(cells[plan.headerCells.indexOf('Đồng ý liên hệ')]).toBe('Yes');
  });

  it('bộ lọc được chuyển cho repository, trần dòng mặc định 20.000', async () => {
    await prepareWorkspaceSubmissionsExport(7, { landingPageSlug: '/Khoa-Hoc/', from: '2026-10-01', to: '2026-10-12' }, { now: NOW });
    expect(repo.listSubmissionIdsForExport).toHaveBeenCalledWith(
      { workspaceOwnerId: 7, formId: null, landingPageSlug: 'khoa-hoc', from: '2026-10-01', to: '2026-10-12' },
      20000
    );
  });

  it('formId của workspace khác (không tìm thấy biểu mẫu) → 404, KHÔNG truy vấn bài nộp', async () => {
    repo.listFormsForExport.mockResolvedValueOnce([]);
    await expect(prepareWorkspaceSubmissionsExport(7, { formId: '999' }, { now: NOW })).rejects.toMatchObject({
      statusCode: 404,
      code: 'FORM_NOT_FOUND',
    });
    expect(repo.listSubmissionIdsForExport).not.toHaveBeenCalled();
  });

  it.each([
    [{ formId: 'abc' }, 'INVALID_FORM_ID'],
    [{ formId: '0' }, 'INVALID_FORM_ID'],
    [{ formId: '12abc' }, 'INVALID_FORM_ID'],
    [{ from: 'hôm qua' }, 'INVALID_DATE'],
    [{ to: '2026-02-31' }, 'INVALID_DATE'],
    [{ from: '2026-10-12', to: '2026-10-01' }, 'INVALID_DATE_RANGE'],
  ])('bộ lọc sai %j → 400 %s, chưa đụng DB', async (query, code) => {
    await expect(prepareWorkspaceSubmissionsExport(7, query, { now: NOW })).rejects.toMatchObject({ statusCode: 400, code });
    expect(repo.listSubmissionIdsForExport).not.toHaveBeenCalled();
  });

  it('nhiều hơn trần → truncated=true, tổng giữ nguyên, audit ghi số dòng thật + tổng', async () => {
    repo.listSubmissionIdsForExport.mockResolvedValue({ ids: ['10', '11'], total: 25000 });
    const plan = await prepareWorkspaceSubmissionsExport(7, {}, { now: NOW, maxRows: 2 });
    expect(plan.truncated).toBe(true);
    expect(plan.total).toBe(25000);
    expect(plan.audit).toMatchObject({ exportType: 'form_submissions_workspace', rowCount: 2, totalMatched: 25000, truncated: true });
  });

  it('không bị cắt → truncated=false', async () => {
    const plan = await prepareWorkspaceSubmissionsExport(7, {}, { now: NOW });
    expect(plan.truncated).toBe(false);
    expect(plan.audit).toMatchObject({ rowCount: 1, totalMatched: 1, truncated: false });
  });

  it('loadRows luôn ràng workspace của người gọi', async () => {
    repo.findSubmissionsForExport.mockResolvedValue([]);
    const plan = await prepareWorkspaceSubmissionsExport(7, {}, { now: NOW });
    await plan.loadRows(['10']);
    expect(repo.findSubmissionsForExport).toHaveBeenCalledWith(7, ['10']);
  });
});

describe('prepareFormSubmissionsExport — trang bài nộp một biểu mẫu', () => {
  it('cột = nhãn trường của biểu mẫu đó (không cột "Biểu mẫu", không khối hiển thị)', async () => {
    const plan = await prepareFormSubmissionsExport(7, '1', {}, { now: NOW });
    expect(plan.headerCells).toEqual([
      'Thời gian', 'Người nộp', 'Email', 'Số điện thoại', 'Trạng thái', 'Nguồn landing',
      'UTM source', 'UTM medium', 'UTM campaign', 'UTM content', 'UTM term', 'Đồng ý nhận tin',
      'Họ tên', 'Hài lòng', 'Đồng ý liên hệ', 'Hồ sơ',
    ]);
  });

  it('tên tệp: bai-nop-<slug tên biểu mẫu>-<YYYYMMDD-HHmm>.csv', async () => {
    const plan = await prepareFormSubmissionsExport(7, '1', {}, { now: NOW });
    expect(plan.filename).toBe('bai-nop-dang-ky-hoc-20261013-0030.csv');
  });

  it('biểu mẫu đặt lịch / thu tiền → thêm cột Giờ hẹn, Mã thanh toán, Số tiền', async () => {
    repo.listFormsForExport.mockResolvedValue([{ ...FORM_A, bookingConfig: { enabled: true }, paymentConfig: { enabled: true } }]);
    const plan = await prepareFormSubmissionsExport(7, '1', {}, { now: NOW });
    expect(plan.headerCells).toEqual(expect.arrayContaining(['Giờ hẹn', 'Mã thanh toán', 'Số tiền']));
    const cells = plan.toCells(row({ appointmentAt: '2026-10-14T02:00:00.000Z', paymentCode: 'FA123', paymentAmount: '500000' }));
    expect(cells[plan.headerCells.indexOf('Giờ hẹn')]).toBe('14/10/2026 09:00');
    expect(cells[plan.headerCells.indexOf('Mã thanh toán')]).toBe('FA123');
    expect(cells[plan.headerCells.indexOf('Số tiền')]).toBe(500000);
  });

  it('biểu mẫu không đặt lịch nhưng bài cũ còn mang lịch hẹn → vẫn có cột Giờ hẹn (không mất dữ liệu)', async () => {
    repo.summarizeSubmissionIdsForExport.mockResolvedValue({ formIds: ['1'], hasAppointment: true, hasPayment: false });
    const plan = await prepareFormSubmissionsExport(7, '1', {}, { now: NOW });
    expect(plan.headerCells).toContain('Giờ hẹn');
    expect(plan.headerCells).not.toContain('Mã thanh toán');
  });

  it('khoá chỉ còn trong bài cũ (trường đã xoá) vẫn thành cột, xếp cuối', async () => {
    repo.listAnswerKeysForExport.mockResolvedValue([{ formId: '1', key: 'a_old', label: 'Câu hỏi cũ', type: 'short_text' }]);
    const plan = await prepareFormSubmissionsExport(7, '1', {}, { now: NOW });
    expect(plan.headerCells[plan.headerCells.length - 1]).toBe('Câu hỏi cũ');
    const cells = plan.toCells(row({ answers: { a_old: { label: 'Câu hỏi cũ', type: 'short_text', value: 'giá trị cũ' } } }));
    expect(cells[cells.length - 1]).toBe('giá trị cũ');
  });

  it('bộ lọc ngày lịch hẹn (date) chuyển xuống repository; ghi vào audit', async () => {
    const plan = await prepareFormSubmissionsExport(7, '1', { date: '2026-10-14' }, { now: NOW });
    expect(repo.listSubmissionIdsForExport).toHaveBeenCalledWith({ workspaceOwnerId: 7, formId: 1, date: '2026-10-14' }, 20000);
    expect(plan.audit).toMatchObject({ exportType: 'form_submissions_form', formId: 1, filters: { date: '2026-10-14' } });
  });

  it('biểu mẫu không thuộc workspace → 404', async () => {
    repo.listFormsForExport.mockResolvedValue([]);
    await expect(prepareFormSubmissionsExport(7, '1', {}, { now: NOW })).rejects.toMatchObject({ statusCode: 404, code: 'FORM_NOT_FOUND' });
    expect(repo.listSubmissionIdsForExport).not.toHaveBeenCalled();
  });

  it.each([['abc'], ['0'], ['-3']])('id biểu mẫu %j không hợp lệ → 400', async (id) => {
    await expect(prepareFormSubmissionsExport(7, id, {}, { now: NOW })).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_ID' });
  });

  it('date sai định dạng → 400', async () => {
    await expect(prepareFormSubmissionsExport(7, '1', { date: '14/10/2026' }, { now: NOW })).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_DATE',
    });
  });
});
