import { describe, expect, it } from '@jest/globals';
import {
  buildProductUrlKeys,
  getPrimaryLandingHosts,
  landingPublicUrlKeys,
  normalizeUrlKey,
} from '../productLinkMatch.util.js';

describe('normalizeUrlKey', () => {
  it('bỏ dấu chấm cuối (link thật production)', () => {
    expect(normalizeUrlKey('https://hanhchinh.ai.vn/nangcap.')).toBe('hanhchinh.ai.vn/nangcap');
    expect(normalizeUrlKey('https://hanhchinh.ai.vn/nangcap')).toBe('hanhchinh.ai.vn/nangcap');
  });
  it('bỏ các dấu câu dính cuối khác', () => {
    for (const tail of [',', ')', '.)', '!', '?', '"', ';']) {
      expect(normalizeUrlKey(`https://shop.vn/khoa-hoc${tail}`)).toBe('shop.vn/khoa-hoc');
    }
  });
  it('host chữ thường, bỏ www., bỏ / cuối', () => {
    expect(normalizeUrlKey('HTTPS://WWW.Shop.VN/Khoa-Hoc/')).toBe('shop.vn/khoa-hoc');
    expect(normalizeUrlKey('https://shop.vn/')).toBe('shop.vn');
    expect(normalizeUrlKey('https://shop.vn')).toBe('shop.vn');
  });
  it('bỏ query (utm_*) và hash', () => {
    expect(
      normalizeUrlKey('https://founderai.biz/lp/abc?utm_source=email_campaign&utm_campaign=9&utm_customer=3#top')
    ).toBe('founderai.biz/lp/abc');
  });
  it('khác path cùng host thì khác khoá', () => {
    expect(normalizeUrlKey('https://shop.vn/a')).not.toBe(normalizeUrlKey('https://shop.vn/b'));
    expect(normalizeUrlKey('https://shop.vn/a')).not.toBe(normalizeUrlKey('https://shop.vn/a/b'));
    expect(normalizeUrlKey('https://shop.vn')).not.toBe(normalizeUrlKey('https://shop.vn/a'));
  });
  it('chấp nhận link không có scheme, từ chối rác / scheme khác', () => {
    expect(normalizeUrlKey('shop.vn/a')).toBe('shop.vn/a');
    expect(normalizeUrlKey('')).toBeNull();
    expect(normalizeUrlKey(null)).toBeNull();
    expect(normalizeUrlKey('khong phai url')).toBeNull();
    expect(normalizeUrlKey('mailto:a@b.vn')).toBeNull();
    expect(normalizeUrlKey('javascript:alert(1)')).toBeNull();
    expect(normalizeUrlKey('ftp://shop.vn/a')).toBeNull();
  });
});

describe('landingPublicUrlKeys / buildProductUrlKeys', () => {
  const hosts = ['founderai.biz'];
  it('/lp/:slug trên host chính + tên miền active', () => {
    const keys = landingPublicUrlKeys({ slug: 'Khoa-AI', hostnames: ['khoa-ai.founderai.biz', 'Learn.Shop.vn'] }, hosts);
    expect(keys).toEqual(['founderai.biz/lp/khoa-ai', 'khoa-ai.founderai.biz', 'learn.shop.vn']);
  });
  it('landing không slug chỉ còn tên miền', () => {
    expect(landingPublicUrlKeys({ slug: null, hostnames: ['a.founderai.biz'] }, hosts)).toEqual(['a.founderai.biz']);
  });
  it('gộp product_url (bỏ qua khi rỗng) với landing', () => {
    const set = buildProductUrlKeys(
      { productUrl: 'https://www.shop.vn/p1/', landings: [{ slug: 'x', hostnames: [] }] },
      hosts
    );
    expect([...set].sort()).toEqual(['founderai.biz/lp/x', 'shop.vn/p1']);
    expect(buildProductUrlKeys({ productUrl: '  ', landings: [] }, hosts).size).toBe(0);
  });
  it('host chính gồm founderai.biz và host của FRONTEND_URL', () => {
    expect(getPrimaryLandingHosts({ FRONTEND_URL: 'https://www.app.example.vn' }).sort()).toEqual([
      'app.example.vn',
      'founderai.biz',
    ]);
    expect(getPrimaryLandingHosts({ FRONTEND_URL: 'http://localhost:5174' })).toEqual(['founderai.biz']);
  });
});
