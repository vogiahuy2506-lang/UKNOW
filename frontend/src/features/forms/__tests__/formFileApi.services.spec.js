import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * PR-4b — hai service gọi API cho trường file:
 *  - formPublicApi: xin URL ký → PUT thẳng lên URL (axios trần, đúng header server trả, có tiến độ + huỷ); đường dẫn "/api/..."
 *    của kho cục bộ được ghép với origin của base API; chủ hết dung lượng → trả { quotaExceeded, skipToken } mà không PUT.
 *  - formAdminApi: hỏi cờ tính năng (lỗi → TẮT, không ném) và lấy link tải ngắn hạn.
 */

const mocks = vi.hoisted(() => ({
  publicPost: vi.fn(),
  bareAxiosPut: vi.fn(),
  adminGet: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    create: () => ({ get: vi.fn(), post: mocks.publicPost }),
    put: mocks.bareAxiosPut,
  },
}));

vi.mock('../../../services/api', () => ({
  default: { get: mocks.adminGet, defaults: { baseURL: 'http://localhost:5174/api' } },
}));

import {
  requestPublicFileUpload,
  putFileToUploadUrl,
  resolveUploadUrl,
  uploadPublicFormFile,
} from '../services/formPublicApi.service';
import { fetchFormCapabilities, fetchSubmissionFileLink } from '../services/formAdminApi.service';

const FIELD = { key: 'f_cv', label: 'Hồ sơ', type: 'file' };

describe('formPublicApi — tải tệp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requestPublicFileUpload gửi fieldKey/fileName/size/contentType tới /public/forms/:key/uploads', async () => {
    mocks.publicPost.mockResolvedValue({ data: { data: { uploadId: 'u1' } } });
    const data = await requestPublicFileUpload('KEY 1', { fieldKey: 'f_cv', fileName: 'a.png', size: 5, contentType: 'image/png' });
    expect(mocks.publicPost).toHaveBeenCalledWith('/public/forms/KEY%201/uploads', {
      fieldKey: 'f_cv', fileName: 'a.png', size: 5, contentType: 'image/png',
    });
    expect(data).toEqual({ uploadId: 'u1' });
  });

  it('resolveUploadUrl: URL tuyệt đối (GCS) dùng nguyên; đường dẫn "/" ghép origin của base API', () => {
    const signed = 'https://storage.googleapis.com/bucket/uploads/7/forms/3/tmp/x.pdf?X-Goog-Signature=abc';
    expect(resolveUploadUrl(signed)).toBe(signed);
    expect(resolveUploadUrl('/api/public/forms/K/uploads/U/content')).toMatch(/^https?:\/\/[^/]+\/api\/public\/forms\/K\/uploads\/U\/content$/);
  });

  it('putFileToUploadUrl: PUT File lên URL với ĐÚNG header server trả, không timeout, có tiến độ (làm tròn, kẹp 100) và signal', async () => {
    mocks.bareAxiosPut.mockImplementation(async (_url, _file, config) => {
      config.onUploadProgress({ loaded: 1, total: 3 });
      config.onUploadProgress({ loaded: 3, total: 3 });
      config.onUploadProgress({ loaded: 9, total: 3 });
      config.onUploadProgress({ loaded: 5 }); // thiếu total: bỏ qua
    });
    const file = new File(['abc'], 'a.pdf', { type: 'application/pdf' });
    const onProgress = vi.fn();
    const signal = new AbortController().signal;
    await putFileToUploadUrl({
      uploadUrl: 'https://storage.googleapis.com/b/x?sig=1',
      headers: { 'Content-Type': 'application/pdf', 'x-goog-content-length-range': '1,10485760' },
      file,
      onProgress,
      signal,
    });
    const [url, body, config] = mocks.bareAxiosPut.mock.calls[0];
    expect(url).toBe('https://storage.googleapis.com/b/x?sig=1');
    expect(body).toBe(file);
    expect(config.headers).toEqual({ 'Content-Type': 'application/pdf', 'x-goog-content-length-range': '1,10485760' });
    expect(config.timeout).toBe(0);
    expect(config.withCredentials).toBe(false);
    expect(config.signal).toBe(signal);
    expect(onProgress.mock.calls.map((c) => c[0])).toEqual([33, 100, 100]);
  });

  it('uploadPublicFormFile: xin URL rồi PUT; trả { uploadId }', async () => {
    mocks.publicPost.mockResolvedValue({
      data: {
        data: {
          uploadId: 'u-9',
          uploadUrl: 'https://storage.googleapis.com/b/x?sig=1',
          headers: { 'Content-Type': 'image/png' },
        },
      },
    });
    mocks.bareAxiosPut.mockResolvedValue({});
    const file = new File(['abc'], 'anh.png', { type: 'image/png' });
    const result = await uploadPublicFormFile('KEY', FIELD, file, {});
    expect(mocks.publicPost.mock.calls[0][1]).toEqual({ fieldKey: 'f_cv', fileName: 'anh.png', size: 3, contentType: 'image/png' });
    expect(mocks.bareAxiosPut).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ uploadId: 'u-9' });
  });

  it('chủ hết dung lượng: trả { quotaExceeded, skipToken } và KHÔNG PUT', async () => {
    mocks.publicPost.mockResolvedValue({ data: { data: { quotaExceeded: true, skipToken: 'tok' } } });
    const result = await uploadPublicFormFile('KEY', FIELD, new File(['abc'], 'a.png', { type: 'image/png' }), {});
    expect(result).toEqual({ quotaExceeded: true, skipToken: 'tok' });
    expect(mocks.bareAxiosPut).not.toHaveBeenCalled();
  });

  it('lỗi xin URL (400 FILE_TYPE_FORBIDDEN) được ném nguyên để renderer đọc mã', async () => {
    const err = { response: { status: 400, data: { code: 'FILE_TYPE_FORBIDDEN' } } };
    mocks.publicPost.mockRejectedValue(err);
    await expect(uploadPublicFormFile('KEY', FIELD, new File(['x'], 'a.exe'), {})).rejects.toBe(err);
    expect(mocks.bareAxiosPut).not.toHaveBeenCalled();
  });
});

describe('formAdminApi — cờ tính năng + link tải', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchFormCapabilities: đọc fileUploadsEnabled; lỗi mạng → TẮT, không ném', async () => {
    mocks.adminGet.mockResolvedValueOnce({ data: { data: { fileUploadsEnabled: true } } });
    await expect(fetchFormCapabilities()).resolves.toEqual({ fileUploadsEnabled: true });
    expect(mocks.adminGet).toHaveBeenCalledWith('/forms/capabilities');

    mocks.adminGet.mockResolvedValueOnce({ data: { data: {} } });
    await expect(fetchFormCapabilities()).resolves.toEqual({ fileUploadsEnabled: false });

    mocks.adminGet.mockRejectedValueOnce(new Error('Network Error'));
    await expect(fetchFormCapabilities()).resolves.toEqual({ fileUploadsEnabled: false });
  });

  it('fetchSubmissionFileLink: gọi đúng đường dẫn (mã hoá khoá trường) và ghép path với base API', async () => {
    mocks.adminGet.mockResolvedValue({
      data: { data: { path: '/public/forms/files/tok.sig', fileName: 'CV.pdf', expiresAt: '2026-10-12T10:00:00.000Z' } },
    });
    const link = await fetchSubmissionFileLink(3, 9, 'f_cv', 1);
    expect(mocks.adminGet).toHaveBeenCalledWith('/forms/3/submissions/9/files/f_cv/1/link');
    expect(link).toEqual({
      url: 'http://localhost:5174/api/public/forms/files/tok.sig',
      fileName: 'CV.pdf',
      expiresAt: '2026-10-12T10:00:00.000Z',
    });
  });
});
