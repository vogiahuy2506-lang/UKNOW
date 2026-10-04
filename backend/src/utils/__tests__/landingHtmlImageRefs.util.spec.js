import { describe, expect, it } from '@jest/globals';
import {
  IMAGE_URL_REGEX,
  buildImageUrlAllowlist,
  collectImageContextUrls,
  collectSourceUrls,
  findDisallowedImageUrls,
  isExternalUrl,
  parseSrcsetUrls,
} from '../landingHtmlImageRefs.util.js';

/**
 * B-6 — nhận diện URL ảnh bất kể đuôi. Hai chiều đều được ghim: ảnh kho không đuôi PHẢI bị bắt, còn phông chữ,
 * stylesheet, liên kết, video, nhúng YouTube KHÔNG được bị coi là ảnh bịa (chặn nhầm landing hợp lệ).
 */

describe('parseSrcsetUrls', () => {
  it('tách URL, bỏ descriptor 1x/2x/640w', () => {
    expect(parseSrcsetUrls('a.png 1x, b.png 2x')).toEqual(['a.png', 'b.png']);
    expect(parseSrcsetUrls('https://x.test/a.jpg 640w,https://x.test/b.jpg 1280w')).toEqual([
      'https://x.test/a.jpg',
      'https://x.test/b.jpg',
    ]);
  });

  it('URL chứa dấu phẩy (Cloudinary w_300,h_200) không bị cắt đôi', () => {
    expect(parseSrcsetUrls('https://res.cloudinary.com/demo/w_300,h_200/a.jpg 300w, https://res.cloudinary.com/demo/w_600,h_400/a.jpg 600w')).toEqual([
      'https://res.cloudinary.com/demo/w_300,h_200/a.jpg',
      'https://res.cloudinary.com/demo/w_600,h_400/a.jpg',
    ]);
  });

  it('ứng viên không descriptor, dấu phẩy dư, rỗng', () => {
    expect(parseSrcsetUrls('a.png, b.png,')).toEqual(['a.png', 'b.png']);
    expect(parseSrcsetUrls('')).toEqual([]);
    expect(parseSrcsetUrls(null)).toEqual([]);
  });
});

describe('collectImageContextUrls — lấy URL ảnh từ ngữ cảnh ảnh, bất kể đuôi', () => {
  it('img src + srcset, source srcset trong picture, video poster, svg image href', () => {
    const html =
      '<img src="https://images.unsplash.com/photo-1?w=800" srcset="https://picsum.photos/400 1x, https://picsum.photos/800 2x">' +
      '<picture><source srcset="https://placehold.co/600x400 1x" media="(min-width:640px)"></picture>' +
      '<video poster="https://cdn.x.test/poster?id=9"></video>' +
      '<svg><image href="https://cdn.x.test/svgimg"/><image xlink:href="https://cdn.x.test/svgimg2"/></svg>';
    expect(collectImageContextUrls(html).sort()).toEqual(
      [
        'https://images.unsplash.com/photo-1?w=800',
        'https://picsum.photos/400',
        'https://picsum.photos/800',
        'https://placehold.co/600x400',
        'https://cdn.x.test/poster?id=9',
        'https://cdn.x.test/svgimg',
        'https://cdn.x.test/svgimg2',
      ].sort()
    );
  });

  it('url(...) trong style, trong class Tailwind bg-[url()] và trong khối <style>; có nháy / không nháy / nháy dạng thực thể', () => {
    const html =
      '<div style="background-image:url(https://a.test/bg1)"></div>' +
      '<div style="background-image: url(\'https://a.test/bg2\')"></div>' +
      '<div style="background-image:url(&quot;https://a.test/bg3&quot;)"></div>' +
      '<section class="bg-cover bg-[url(\'https://images.unsplash.com/photo-9\')]"></section>' +
      '<style>.hero{background:url("https://a.test/bg4") center/cover}</style>';
    expect(collectImageContextUrls(html).sort()).toEqual(
      ['https://a.test/bg1', 'https://a.test/bg2', 'https://a.test/bg3', 'https://images.unsplash.com/photo-9', 'https://a.test/bg4'].sort()
    );
  });

  it('KHÔNG coi là ảnh: @import, @font-face, link stylesheet, Google Fonts, a href, iframe, video src, relative, data:', () => {
    const html =
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">' +
      '<link rel="icon" href="https://x.test/favicon">' +
      '<style>@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400");' +
      '@import "https://a.test/other.css";' +
      '@font-face{font-family:F;src:url(https://fonts.gstatic.com/s/inter/v12/abc) format("woff2")}' +
      'body{font-family:F}</style>' +
      '<a href="https://example.com/trang-khac">x</a>' +
      '<iframe src="https://www.youtube.com/embed/abc"></iframe>' +
      '<video src="https://cdn.x.test/v"><source src="https://cdn.x.test/v.mp4" type="video/mp4"></video>' +
      '<img src="/lp-assets/uploads/1/landing/a.png"><img src="images/a"><img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">' +
      '<svg><use href="#icon"/></svg>';
    expect(collectImageContextUrls(html)).toEqual([]);
  });

  it('URL không có chữ http (protocol-relative) vẫn tính là ngoài hệ thống', () => {
    expect(collectImageContextUrls('<img src="//cdn.x.test/a">')).toEqual(['//cdn.x.test/a']);
    expect(isExternalUrl('//cdn.x.test/a')).toBe(true);
    expect(isExternalUrl('/lp-assets/a.png')).toBe(false);
  });

  it('thực thể trong src được giải mã trước khi so khớp (&amp; → &)', () => {
    expect(collectImageContextUrls('<img src="https://a.test/i?x=1&amp;y=2">')).toEqual(['https://a.test/i?x=1&y=2']);
  });
});

describe('allowlist và findDisallowedImageUrls', () => {
  const asset = { url: 'https://api.founderai.biz/lp-assets/uploads/1/landing/abc_logo.png' };

  it('ảnh kho không đuôi (Unsplash/picsum/placehold) bị bắt; ảnh đính kèm thì qua', () => {
    const html =
      `<img src="${asset.url}">` +
      '<img src="https://images.unsplash.com/photo-1511?w=800">' +
      '<img src="https://picsum.photos/800/600">' +
      '<div style="background:url(https://placehold.co/600x400)"></div>';
    const allow = buildImageUrlAllowlist({ assets: [asset] });
    expect(findDisallowedImageUrls(html, allow)).toEqual([
      'https://images.unsplash.com/photo-1511?w=800',
      'https://picsum.photos/800/600',
      'https://placehold.co/600x400',
    ]);
  });

  it('URL có đuôi ảnh ở BẤT KỲ đâu vẫn bị bắt như chốt cũ (og:image, a href)', () => {
    const html = '<meta property="og:image" content="https://fake.test/og.jpg"><a href="https://fake.test/x.png">x</a>';
    expect(findDisallowedImageUrls(html, new Set())).toEqual(['https://fake.test/og.jpg', 'https://fake.test/x.png']);
  });

  it('logo KHÔNG đuôi trong hồ sơ doanh nghiệp (Logo URL: …) và URL người dùng dán vào yêu cầu được phép', () => {
    const source = 'Tên: A\nLogo URL: https://cdn.brand.test/logo?id=3.\nWebsite: https://brand.test';
    const allow = buildImageUrlAllowlist({ allowedSourceText: source });
    expect(allow.has('https://cdn.brand.test/logo?id=3.')).toBe(true);
    expect(allow.has('https://cdn.brand.test/logo?id=3')).toBe(true); // bản bỏ dấu chấm cuối câu
    expect(findDisallowedImageUrls('<img src="https://cdn.brand.test/logo?id=3">', allow)).toEqual([]);
  });

  it('HTML hiện tại làm nguồn: URL trong thuộc tính có & thoát thực thể vẫn khớp bản giải mã', () => {
    const source = '<img src="https://cdn.shop.test/p?id=1&amp;v=2">';
    const allow = buildImageUrlAllowlist({ allowedSourceText: source });
    expect(findDisallowedImageUrls('<img src="https://cdn.shop.test/p?id=1&v=2">', allow)).toEqual([]);
    expect(findDisallowedImageUrls('<img src="https://cdn.shop.test/p?id=1&amp;v=2">', allow)).toEqual([]);
  });

  it('collectSourceUrls: URL trong nháy thực thể không dính &quot;', () => {
    const urls = collectSourceUrls('<div style="background:url(&quot;https://a.test/bg&quot;)"></div>');
    expect(urls.has('https://a.test/bg')).toBe(true);
  });

  it('IMAGE_URL_REGEX vẫn xuất ra đúng như cũ', () => {
    expect('https://x.test/a.PNG?v=1 và https://x.test/b'.match(IMAGE_URL_REGEX)).toEqual(['https://x.test/a.PNG?v=1']);
  });
});
