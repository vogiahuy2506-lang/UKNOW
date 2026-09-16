import { describe, expect, it } from '@jest/globals';

import { mergeAndFilterLandingFiles } from '../ai.controller.js';

/**
 * PLAN_TEP_DINH_KEM_LANDING_MOI_DINH_DANG_2026-09-15.md — ca 14.
 *
 * Trước bản này, tệp thứ 4 trở đi bị cắt trong IM LẶNG: người dùng đính kèm 5 ảnh, AI chỉ nhận 3,
 * không ai báo gì. Nay phần bị cắt đi vào `skipped` để controller trả về `data.skippedAttachments`.
 */
describe('mergeAndFilterLandingFiles — trần 3 ảnh + 3 tài liệu (ca 14)', () => {
  const img = (n) => ({ tempId: `i${n}`, originalName: `anh-${n}.png`, contentType: 'image/png' });
  const doc = (n) => ({ tempId: `d${n}`, originalName: `tai-lieu-${n}.pdf`, contentType: 'application/pdf' });

  it('5 ảnh → 3 ảnh được dùng, 2 ảnh vào skipped kèm lý do', () => {
    const { files, skipped } = mergeAndFilterLandingFiles([img(1), img(2), img(3), img(4), img(5)]);

    expect(files.map((f) => f.originalName)).toEqual(['anh-1.png', 'anh-2.png', 'anh-3.png']);
    expect(skipped.map((s) => s.originalName)).toEqual(['anh-4.png', 'anh-5.png']);
    expect(skipped[0].reason).toBe('Mỗi lượt chỉ dùng tối đa 3 ảnh và 3 tài liệu');
  });

  it('4 ảnh + 4 tài liệu → mỗi loại giữ 3, 2 tệp vào skipped, ảnh xếp trước tài liệu', () => {
    const { files, skipped } = mergeAndFilterLandingFiles(
      [img(1), doc(1), img(2), doc(2), img(3), doc(3), img(4), doc(4)]
    );

    expect(files).toHaveLength(6);
    expect(files.slice(0, 3).every((f) => f.contentType === 'image/png')).toBe(true);
    expect(skipped.map((s) => s.originalName)).toEqual(['anh-4.png', 'tai-lieu-4.pdf']);
  });

  it('đuôi ảnh mới (.gif/.heic/.heif) được xếp là ẢNH kể cả khi trình duyệt không khai MIME', () => {
    const { files } = mergeAndFilterLandingFiles([
      { tempId: 'g', originalName: 'anh-dong.GIF', contentType: 'application/octet-stream' },
      { tempId: 'h', originalName: 'iphone.heic', contentType: '' },
      { tempId: 'f', originalName: 'iphone.heif', contentType: '' },
      { tempId: 'p', originalName: 'brochure.pdf', contentType: 'application/pdf' },
    ]);

    // 3 ảnh đầu tiên (đủ trần) rồi mới tới tài liệu → tệp PDF vẫn được giữ vì trần tài liệu riêng
    expect(files.map((f) => f.originalName)).toEqual(['anh-dong.GIF', 'iphone.heic', 'iphone.heif', 'brochure.pdf']);
  });

  it('tệp trùng khoá (đã có trong phiên chat) chỉ tính một lần, không chiếm chỗ của tệp khác', () => {
    const same = { tempId: 'x', originalName: 'logo.png', contentType: 'image/png' };
    const { files, skipped } = mergeAndFilterLandingFiles([same, same], [same, img(9)]);

    expect(files.map((f) => f.originalName)).toEqual(['logo.png', 'anh-9.png']);
    expect(skipped).toHaveLength(0);
  });
});
