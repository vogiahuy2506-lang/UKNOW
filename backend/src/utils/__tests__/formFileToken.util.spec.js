/**
 * PR-4b — token HMAC ngắn hạn: link tải tệp của chủ biểu mẫu + dấu "chủ hết dung lượng" cho trường bắt buộc.
 */
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { generateFileToken } from '../fileDownloadToken.js';
import {
  FORM_FILE_DOWNLOAD_TTL_MS,
  FORM_FILE_SKIP_TTL_MS,
  createFormFileDownloadToken,
  createFormFileSkipToken,
  isValidFormFileSkipToken,
  verifyFormFileDownloadToken,
} from '../formFileToken.util.js';

const FILE = { storageKey: 'uploads/7/forms/3/submissions/9/abc.pdf', fileName: 'Hồ sơ.pdf', contentType: 'application/pdf' };
const originalSecret = process.env.JWT_SECRET;

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-form-file-token';
});
afterAll(() => {
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
  jest.useRealTimers();
});

describe('token tải tệp', () => {
  it('ký rồi kiểm lại ra đúng khoá + tên + loại; hạn mặc định 5 phút', () => {
    const { token, expiresAt } = createFormFileDownloadToken(FILE);
    expect(verifyFormFileDownloadToken(token)).toEqual(FILE);
    expect(FORM_FILE_DOWNLOAD_TTL_MS).toBe(5 * 60 * 1000);
    expect(expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(FORM_FILE_DOWNLOAD_TTL_MS);
    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(FORM_FILE_DOWNLOAD_TTL_MS - 5000);
  });

  it('hết hạn thì bị từ chối', () => {
    const { token } = createFormFileDownloadToken(FILE, 1000);
    jest.useFakeTimers();
    jest.setSystemTime(Date.now() + 5000);
    expect(() => verifyFormFileDownloadToken(token)).toThrow(/hết hạn/);
    jest.useRealTimers();
  });

  it('sửa payload hoặc chữ ký thì bị từ chối', () => {
    const { token } = createFormFileDownloadToken(FILE);
    const [body, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ k: 'uploads/9/forms/9/submissions/9/khac.pdf', n: 'x', m: '', x: Date.now() + 1e9 })).toString('base64url');
    expect(() => verifyFormFileDownloadToken(`${forged}.${sig}`)).toThrow();
    expect(() => verifyFormFileDownloadToken(`${body}.${sig.slice(0, -2)}AA`)).toThrow();
    expect(() => verifyFormFileDownloadToken('khong-co-dau-cham')).toThrow();
    expect(() => verifyFormFileDownloadToken('')).toThrow();
    expect(() => verifyFormFileDownloadToken(undefined)).toThrow();
  });

  it('token link email chiến dịch (fileDownloadToken.js, không hạn) KHÔNG dùng được ở đây', () => {
    const campaignToken = generateFileToken(FILE.storageKey, 1, 2, 'a@b.vn', 'x');
    expect(() => verifyFormFileDownloadToken(campaignToken)).toThrow();
  });

  it('token skip KHÔNG dùng được như token tải (khác mục đích → chữ ký khác)', () => {
    const { token } = createFormFileSkipToken({ formId: 3, fieldKey: 'f_cv' });
    expect(() => verifyFormFileDownloadToken(token)).toThrow();
  });

  it('thiếu JWT_SECRET thì ném lỗi, không ký bằng khoá cố định', () => {
    const saved = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    expect(() => createFormFileDownloadToken(FILE)).toThrow(/JWT_SECRET/);
    process.env.JWT_SECRET = saved;
  });
});

describe('dấu bỏ qua (chủ hết dung lượng)', () => {
  it('đúng biểu mẫu + đúng trường → hợp lệ; hạn 1 giờ', () => {
    const { token } = createFormFileSkipToken({ formId: 3, fieldKey: 'f_cv' });
    expect(isValidFormFileSkipToken(token, { formId: 3, fieldKey: 'f_cv' })).toBe(true);
    expect(isValidFormFileSkipToken(token, { formId: '3', fieldKey: 'f_cv' })).toBe(true);
    expect(FORM_FILE_SKIP_TTL_MS).toBe(60 * 60 * 1000);
  });

  it('sai biểu mẫu hoặc sai trường → không hợp lệ (khách không dùng dấu của trường này cho trường khác)', () => {
    const { token } = createFormFileSkipToken({ formId: 3, fieldKey: 'f_cv' });
    expect(isValidFormFileSkipToken(token, { formId: 4, fieldKey: 'f_cv' })).toBe(false);
    expect(isValidFormFileSkipToken(token, { formId: 3, fieldKey: 'f_khac' })).toBe(false);
  });

  it('hết hạn / bịa / rỗng → không hợp lệ, không ném lỗi', () => {
    const { token } = createFormFileSkipToken({ formId: 3, fieldKey: 'f_cv' }, 1000);
    jest.useFakeTimers();
    jest.setSystemTime(Date.now() + 5000);
    expect(isValidFormFileSkipToken(token, { formId: 3, fieldKey: 'f_cv' })).toBe(false);
    jest.useRealTimers();
    expect(isValidFormFileSkipToken('bịa.bịa', { formId: 3, fieldKey: 'f_cv' })).toBe(false);
    expect(isValidFormFileSkipToken('', { formId: 3, fieldKey: 'f_cv' })).toBe(false);
    expect(isValidFormFileSkipToken(undefined, { formId: 3, fieldKey: 'f_cv' })).toBe(false);
  });
});
