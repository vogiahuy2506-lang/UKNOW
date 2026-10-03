import { describe, it, expect, vi, beforeEach } from 'vitest';
import api from '../../../../services/api.js';
import {
  fetchLandingCustomDomain,
  postLandingCustomDomainCheck,
  putLandingCustomDomain,
  postLandingCustomDomainVerify,
  deleteLandingCustomDomain,
  postLandingFreeLink,
} from '../landingPagesAdminApi.service.js';

// Mọi gọi tên miền riêng phải đi qua instance `api` (interceptor gắn Bearer + X-Owner-Context) — KHÔNG fetch thô
// (nút "Kiểm tra kết nối" cũ dùng fetch thô nên luôn 401).
vi.mock('../../../../services/api.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

describe('landingPagesAdminApi — tên miền riêng', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('fetchLandingCustomDomain: GET .../custom-domain, trả data.data', async () => {
    api.get.mockResolvedValue({ data: { success: true, data: { configured: true, hostname: 'abc.founderai.biz' } } });

    await expect(fetchLandingCustomDomain(7)).resolves.toEqual({ configured: true, hostname: 'abc.founderai.biz' });
    expect(api.get).toHaveBeenCalledWith('/admin/landing-pages/7/custom-domain');
  });

  it('postLandingCustomDomainCheck: POST .../custom-domain/check { hostname, isApexDomain } với timeout nới (DNS thật mất vài giây)', async () => {
    api.post.mockResolvedValue({ data: { success: true, data: { verified: false, dnsRecords: [] } } });

    await expect(postLandingCustomDomainCheck(7, 'lp.example.com', true)).resolves.toEqual({ verified: false, dnsRecords: [] });
    expect(api.post).toHaveBeenCalledWith(
      '/admin/landing-pages/7/custom-domain/check',
      { hostname: 'lp.example.com', isApexDomain: true },
      { timeout: 30000 }
    );
  });

  it('putLandingCustomDomain: PUT .../custom-domain { hostname, isApexDomain } (mặc định subdomain)', async () => {
    api.put.mockResolvedValue({ data: { success: true, data: { status: 'active' } } });

    await expect(putLandingCustomDomain(7, 'lp.example.com')).resolves.toEqual({ status: 'active' });
    expect(api.put).toHaveBeenCalledWith(
      '/admin/landing-pages/7/custom-domain',
      { hostname: 'lp.example.com', isApexDomain: false },
      { timeout: 30000 }
    );
  });

  it('postLandingCustomDomainVerify: POST .../custom-domain/verify qua api (có Bearer)', async () => {
    api.post.mockResolvedValue({ data: { success: true, data: { status: 'active' } } });

    await expect(postLandingCustomDomainVerify(7)).resolves.toEqual({ status: 'active' });
    expect(api.post).toHaveBeenCalledWith('/admin/landing-pages/7/custom-domain/verify', undefined, { timeout: 30000 });
  });

  it('deleteLandingCustomDomain: DELETE .../custom-domain qua api', async () => {
    api.delete.mockResolvedValue({ data: { success: true, data: { ok: true } } });

    await expect(deleteLandingCustomDomain(7)).resolves.toEqual({ ok: true });
    expect(api.delete).toHaveBeenCalledWith('/admin/landing-pages/7/custom-domain', { timeout: 30000 });
  });

  it('postLandingFreeLink: POST .../free-link { slug } qua api (có Bearer), timeout nới, trả data.data', async () => {
    const payload = { slug: 'abc', restored: true, provisioned: true, domain: { hostname: 'abc.founderai.biz' } };
    api.post.mockResolvedValue({ data: { success: true, data: payload } });

    await expect(postLandingFreeLink(7, '  abc ')).resolves.toEqual(payload);
    expect(api.post).toHaveBeenCalledWith('/admin/landing-pages/7/free-link', { slug: 'abc' }, { timeout: 30000 });
  });

  it('postLandingFreeLink: không có slug (rỗng / bỏ trống) → gửi thân {} để backend dùng slug đang có', async () => {
    api.post.mockResolvedValue({ data: { success: true, data: { slug: 'abc' } } });

    await postLandingFreeLink(7, '   ');
    await postLandingFreeLink(7);

    expect(api.post).toHaveBeenNthCalledWith(1, '/admin/landing-pages/7/free-link', {}, { timeout: 30000 });
    expect(api.post).toHaveBeenNthCalledWith(2, '/admin/landing-pages/7/free-link', {}, { timeout: 30000 });
  });

  it('không hàm nào dùng fetch thô', async () => {
    api.get.mockResolvedValue({ data: {} });
    api.post.mockResolvedValue({ data: {} });
    api.put.mockResolvedValue({ data: {} });
    api.delete.mockResolvedValue({ data: {} });

    await fetchLandingCustomDomain(1);
    await postLandingCustomDomainCheck(1, 'a.example.com');
    await putLandingCustomDomain(1, 'a.example.com');
    await postLandingCustomDomainVerify(1);
    await deleteLandingCustomDomain(1);
    await postLandingFreeLink(1, 'a');

    expect(fetch).not.toHaveBeenCalled();
  });
});
