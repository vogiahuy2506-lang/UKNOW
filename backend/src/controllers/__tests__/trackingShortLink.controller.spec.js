/**
 * /t/:code chỉ chuyển hướng khi URL đích lưu trong DB là URL tuyệt đối http/https.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockResolveByCode = jest.fn();
jest.unstable_mockModule('../../services/tracking/trackingShortLink.service.js', () => ({
  default: { resolveByCode: mockResolveByCode },
}));

const { default: controller } = await import('../trackingShortLink.controller.js');

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.redirect = jest.fn(() => res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('trackingShortLink.controller.redirectByCode', () => {
  it('đích https → 302', async () => {
    mockResolveByCode.mockResolvedValue({
      status: 'found',
      destinationUrl: 'https://api.founderai.biz/api/customers/zalo-tracking/click/tok?url=x',
    });
    const res = makeRes();
    await controller.redirectByCode({ params: { code: 'abcDEF1234567890' } }, res);
    expect(res.redirect).toHaveBeenCalledWith(
      302,
      'https://api.founderai.biz/api/customers/zalo-tracking/click/tok?url=x'
    );
  });

  it.each([
    'javascript:alert(document.cookie)',
    'data:text/html;base64,PHNjcmlwdD4=',
    '//evil.example.net/path',
    '/relative/path',
    'ftp://files.example.com/a',
    '',
    null,
  ])('đích %p → 404, không chuyển hướng', async (destinationUrl) => {
    mockResolveByCode.mockResolvedValue({ status: 'found', destinationUrl });
    const res = makeRes();
    await controller.redirectByCode({ params: { code: 'abcDEF1234567890' } }, res);
    expect(res.redirect).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('mã không tồn tại → 404', async () => {
    mockResolveByCode.mockResolvedValue({ status: 'not_found' });
    const res = makeRes();
    await controller.redirectByCode({ params: { code: 'zzz' } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.redirect).not.toHaveBeenCalled();
  });
});
