import { describe, it, expect, jest, beforeEach } from '@jest/globals';

/**
 * Chuông "Có bài nộp mới" của Biểu mẫu (PR-8c): người nhận, nội dung, chiến lược gộp 10 phút, và — quan trọng nhất — KHÔNG BAO GIỜ làm hỏng
 * hay làm chậm bài nộp. Dispatcher (`notifyUsers`) được giả ở đúng ranh giới; chuỗi thật với DB nằm ở tests/integration/formSubmissionBell.test.js.
 */
const notifyUsers = jest.fn();
jest.unstable_mockModule('../notification/notificationDispatch.service.js', () => ({
  notifyUsers: (...args) => notifyUsers(...args),
}));
const logError = jest.fn();
jest.unstable_mockModule('../../utils/logger.util.js', () => ({ logError: (...args) => logError(...args) }));

const {
  FORM_SUBMISSION_BELL_EVENT,
  FORM_SUBMISSION_BELL_WINDOW_MS,
  buildFormSubmissionBellDedupeKey,
  notifyOwnerFormSubmission,
  fireFormSubmissionBell,
  settlePendingFormSubmissionBells,
} = await import('../formSubmissionBell.service.js');

const FORM = { id: 41, workspaceOwnerId: 7, title: 'Đăng ký tư vấn' };

beforeEach(() => {
  notifyUsers.mockReset();
  notifyUsers.mockResolvedValue({ inApp: 1, emailSent: 0, emailSkipped: 0, emailFailed: 0 });
  logError.mockReset();
});

describe('buildFormSubmissionBellDedupeKey — gộp theo biểu mẫu + cửa sổ 10 phút', () => {
  const T0 = new Date('2026-10-12T03:00:00.000Z'); // đúng mép một cửa sổ (UTC chia hết cho 10 phút)

  it('cửa sổ là 10 phút', () => {
    expect(FORM_SUBMISSION_BELL_WINDOW_MS).toBe(10 * 60 * 1000);
  });

  it('hai thời điểm trong CÙNG cửa sổ → cùng khoá; sang cửa sổ sau → khoá khác', () => {
    const a = buildFormSubmissionBellDedupeKey(41, T0);
    expect(buildFormSubmissionBellDedupeKey(41, new Date(T0.getTime() + 9 * 60 * 1000 + 59_000))).toBe(a);
    expect(buildFormSubmissionBellDedupeKey(41, new Date(T0.getTime() + 10 * 60 * 1000))).not.toBe(a);
  });

  it('khác biểu mẫu → khoá khác (không gộp chéo biểu mẫu)', () => {
    expect(buildFormSubmissionBellDedupeKey(41, T0)).not.toBe(buildFormSubmissionBellDedupeKey(42, T0));
  });

  it('khoá nằm trong giới hạn 120 ký tự của dispatcher', () => {
    expect(buildFormSubmissionBellDedupeKey('9'.repeat(30), T0).length).toBeLessThanOrEqual(120);
  });
});

describe('notifyOwnerFormSubmission', () => {
  const NOW = new Date('2026-10-12T03:04:05.000Z');

  it('gửi đúng sự kiện cho CHỦ biểu mẫu, link mở thẳng trang bài nộp của biểu mẫu đó', async () => {
    await notifyOwnerFormSubmission({ form: FORM, submission: { id: 900 }, respondentName: 'Nguyễn An' }, NOW);
    expect(notifyUsers).toHaveBeenCalledTimes(1);
    const arg = notifyUsers.mock.calls[0][0];
    expect(arg.eventType).toBe(FORM_SUBMISSION_BELL_EVENT);
    expect(arg.eventType).toBe('form_submission_received');
    expect(arg.userIds).toEqual([7]);
    expect(arg.link).toBe('/app/forms/41/submissions');
    expect(arg.dedupeKey).toBe(buildFormSubmissionBellDedupeKey(41, NOW));
    expect(arg.severity).toBe('info');
  });

  it('nội dung nêu tên biểu mẫu + người nộp (vi và en)', async () => {
    await notifyOwnerFormSubmission({ form: FORM, respondentName: 'Nguyễn An' }, NOW);
    const arg = notifyUsers.mock.calls[0][0];
    expect(arg.title).toContain('Đăng ký tư vấn');
    expect(arg.message).toContain('Nguyễn An');
    expect(arg.message).toContain('Đăng ký tư vấn');
    expect(arg.titleEn).toContain('Đăng ký tư vấn');
    expect(arg.messageEn).toContain('Nguyễn An');
  });

  it('người nộp: tên → email → SĐT; không có gì thì nói "một khách"', async () => {
    await notifyOwnerFormSubmission({ form: FORM, respondentEmail: 'an@x.vn', respondentPhone: '0901' }, NOW);
    expect(notifyUsers.mock.calls[0][0].message).toContain('an@x.vn');
    await notifyOwnerFormSubmission({ form: FORM, respondentPhone: '0901234567' }, NOW);
    expect(notifyUsers.mock.calls[1][0].message).toContain('0901234567');
    await notifyOwnerFormSubmission({ form: FORM }, NOW);
    expect(notifyUsers.mock.calls[2][0].message).toContain('Một khách');
    expect(notifyUsers.mock.calls[2][0].messageEn).toContain('A customer');
  });

  it('metadata chỉ gồm id/tên biểu mẫu + id bài nộp đầu — KHÔNG có thông tin cá nhân của người nộp', async () => {
    await notifyOwnerFormSubmission(
      { form: FORM, submission: { id: 900 }, respondentName: 'Nguyễn An', respondentEmail: 'an@x.vn', respondentPhone: '0901234567' },
      NOW
    );
    const { metadata } = notifyUsers.mock.calls[0][0];
    expect(metadata).toEqual({ formId: '41', formTitle: 'Đăng ký tư vấn', firstSubmissionId: '900' });
    const json = JSON.stringify(metadata);
    expect(json).not.toContain('Nguyễn An');
    expect(json).not.toContain('an@x.vn');
    expect(json).not.toContain('0901234567');
  });

  it('tên biểu mẫu / người nộp quá dài bị cắt', async () => {
    await notifyOwnerFormSubmission({ form: { ...FORM, title: 'T'.repeat(500) }, respondentName: 'N'.repeat(500) }, NOW);
    const arg = notifyUsers.mock.calls[0][0];
    expect(arg.metadata.formTitle.length).toBe(120);
    expect(arg.message.length).toBeLessThan(500);
  });

  it('không có chủ hợp lệ / không có id biểu mẫu → không gọi dispatcher, không ném', async () => {
    await expect(notifyOwnerFormSubmission({ form: { id: 1, workspaceOwnerId: null } }, NOW)).resolves.toBeUndefined();
    await expect(notifyOwnerFormSubmission({ form: { id: null, workspaceOwnerId: 7 } }, NOW)).resolves.toBeUndefined();
    await expect(notifyOwnerFormSubmission({}, NOW)).resolves.toBeUndefined();
    await expect(notifyOwnerFormSubmission(undefined, NOW)).resolves.toBeUndefined();
    expect(notifyUsers).not.toHaveBeenCalled();
  });

  it('dispatcher ném lỗi → hàm KHÔNG ném, chỉ log', async () => {
    notifyUsers.mockRejectedValue(new Error('DB sập'));
    await expect(notifyOwnerFormSubmission({ form: FORM }, NOW)).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledTimes(1);
    expect(String(logError.mock.calls[0][0])).toContain('DB sập');
  });
});

describe('fireFormSubmissionBell — fire-and-forget theo mẫu Set promise + settle', () => {
  it('trả về NGAY (không chờ dispatcher), settle chờ được dispatcher xong', async () => {
    let finish;
    notifyUsers.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const returned = fireFormSubmissionBell({ form: FORM });
    expect(returned).toBeUndefined();

    let settled = false;
    const settling = settlePendingFormSubmissionBells().then(() => { settled = true; });
    await new Promise((resolve) => setImmediate(resolve));
    expect(notifyUsers).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false); // dispatcher chưa xong thì settle chưa xong

    finish({ inApp: 1 });
    await settling;
    expect(settled).toBe(true);
  });

  it('dispatcher chậm cũng không làm fire bị chậm (bài nộp không đợi chuông)', async () => {
    let finish;
    notifyUsers.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const started = Date.now();
    fireFormSubmissionBell({ form: FORM });
    expect(Date.now() - started).toBeLessThan(50);
    // Dọn: để dispatcher xong, không treo Set cho ca sau.
    await new Promise((resolve) => setImmediate(resolve));
    finish({ inApp: 1 });
    await settlePendingFormSubmissionBells();
  });

  it('dispatcher từ chối → settle vẫn xong, không có unhandled rejection', async () => {
    notifyUsers.mockRejectedValue(new Error('hỏng'));
    fireFormSubmissionBell({ form: FORM });
    await expect(settlePendingFormSubmissionBells()).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalled();
  });

  it('tham số lạ (null) cũng không ném đồng bộ', async () => {
    expect(() => fireFormSubmissionBell(null)).not.toThrow();
    await settlePendingFormSubmissionBells();
    expect(notifyUsers).not.toHaveBeenCalled();
  });

  it('settle khi không còn việc nào đang bay → xong ngay', async () => {
    await expect(settlePendingFormSubmissionBells()).resolves.toBeUndefined();
  });
});
