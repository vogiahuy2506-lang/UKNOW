import { describe, it, expect } from 'vitest';
import {
  looksLikeLayoutComplaint,
  appendFindingsToInstruction,
  pickSectionTitle,
  findLandingMessageIndex,
  applyLayoutResultToMessages,
  setLayoutStatusOnMessages,
  patchLandingMessageData,
  layoutCardKey,
} from '../landingLayoutFlow.js';

const finding = (over = {}) => ({
  kind: 'text_covered', width: 1280, text: '03/02/2026', selector: 'span.block:nth-of-type(1)',
  coveredBy: { text: '1', selector: 'div.absolute:nth-of-type(1)' }, overlapPx: 12, side: 'right',
  sectionTitle: 'Dòng thời gian', ...over,
});
const landing = (html, extra = {}, id) => ({
  role: 'assistant', type: 'landing_page', ...(id != null ? { id } : {}), data: { title: 'T', html, ...extra },
});

describe('looksLikeLayoutComplaint', () => {
  it.each([
    'chữ bị đè lên nhau', 'bị đè', 'đè.', 'Đè quá', 'nút bị che', 'che khuất chữ', 'chữ bị cắt mất', 'lệch qua trái',
    'chữ tràn ra ngoài', 'mất chữ rồi', 'chồng lên nhau', 'text is overlapping', 'the text is cut off', 'BỊ ĐÈ',
  ])('câu than phiền: %s', (text) => {
    expect(looksLikeLayoutComplaint(text)).toBe(true);
  });

  it.each([
    'đổi màu đèn sang vàng', 'thêm checkbox đồng ý', 'chèn thêm ảnh vào đầu trang', 'đổi tiêu đề thành Xin chào',
    'thêm nút đăng ký', 'chè xanh Thái Nguyên', '', undefined, null,
  ])('KHÔNG phải than phiền: %s', (text) => {
    expect(looksLikeLayoutComplaint(text)).toBe(false);
  });
});

describe('appendFindingsToInstruction', () => {
  it('giữ nguyên câu người dùng gõ, nối kết quả đo phía sau', () => {
    const out = appendFindingsToInstruction('chữ bị đè', [finding()]);
    expect(out.startsWith('chữ bị đè\n\n')).toBe(true);
    expect(out).toContain('[Đo bố cục ở 1280px] Chữ "03/02/2026"');
    expect(out).toContain('span.block:nth-of-type(1)');
  });
  it('không có finding → y nguyên', () => {
    expect(appendFindingsToInstruction('chữ bị đè', [])).toBe('chữ bị đè');
    expect(appendFindingsToInstruction('chữ bị đè', undefined)).toBe('chữ bị đè');
  });
});

describe('pickSectionTitle', () => {
  it('lấy tên phần hay gặp nhất; bỏ tên rỗng', () => {
    expect(pickSectionTitle([finding({ sectionTitle: 'A' }), finding({ sectionTitle: 'B' }), finding({ sectionTitle: 'B' }), finding({ sectionTitle: '' })])).toBe('B');
  });
  it('không có tên phần / không phải mảng → rỗng', () => {
    expect(pickSectionTitle([finding({ sectionTitle: '' })])).toBe('');
    expect(pickSectionTitle(undefined)).toBe('');
  });
});

describe('findLandingMessageIndex', () => {
  const list = [
    { role: 'user', content: 'x' },
    landing('<p>A</p>', {}, 11),
    { role: 'assistant', type: 'landing_edit_ack', content: 'ack' },
    landing('<p>B</p>', {}, 12),
  ];
  it('theo id (chuỗi hay số đều được)', () => {
    expect(findLandingMessageIndex(list, { messageId: 11 })).toBe(1);
    expect(findLandingMessageIndex(list, { messageId: '12' })).toBe(3);
  });
  it('không có id khớp → thẻ CUỐI đang mang đúng html; không khớp gì → -1', () => {
    expect(findLandingMessageIndex(list, { messageId: null, html: '<p>A</p>' })).toBe(1);
    expect(findLandingMessageIndex(list, { messageId: 999, html: '<p>B</p>' })).toBe(3);
    expect(findLandingMessageIndex(list, { messageId: null, html: '<p>Z</p>' })).toBe(-1);
    expect(findLandingMessageIndex(list, {})).toBe(-1);
  });
  it('html trùng ở hai thẻ → lấy thẻ cuối', () => {
    expect(findLandingMessageIndex([landing('<p>A</p>'), landing('<p>A</p>')], { html: '<p>A</p>' })).toBe(1);
  });
});

describe('applyLayoutResultToMessages', () => {
  const base = [{ role: 'user', content: 'x' }, landing('<p>v0</p>', { layoutStatus: 'checking' }, 7)];
  const page = (html) => ({ title: 'T2', html });

  it('fixed: ghi html/title mới + canRevert + trạng thái, thêm ĐÚNG MỘT tin xác nhận', () => {
    const next = applyLayoutResultToMessages(base, {
      messageId: 7, baseHtml: '<p>v0</p>', ackContent: 'Đã chỉnh hiển thị: X',
      result: { status: 'fixed', page: page('<p>v1</p>'), changed: true, findings: [], canRevert: true },
    });
    expect(next[1].data).toMatchObject({ html: '<p>v1</p>', title: 'T2', canRevert: true, layoutStatus: 'fixed', layoutFindings: [] });
    expect(next).toHaveLength(3);
    expect(next[2]).toEqual({ role: 'assistant', content: 'Đã chỉnh hiển thị: X', type: 'landing_edit_ack' });
    expect(base[1].data.html).toBe('<p>v0</p>'); // không đột biến đầu vào
  });

  it('clean / unknown: chỉ đổi trạng thái, KHÔNG thêm tin nào, không đổi html', () => {
    for (const status of ['clean', 'unknown']) {
      const next = applyLayoutResultToMessages(base, {
        messageId: 7, baseHtml: '<p>v0</p>', ackContent: 'x',
        result: { status, page: page('<p>v0</p>'), changed: false, findings: [] },
      });
      expect(next).toHaveLength(2);
      expect(next[1].data).toMatchObject({ html: '<p>v0</p>', layoutStatus: status });
    }
  });

  it('still_broken: giữ findings để thẻ nói bằng tiếng người, cập nhật html đã sửa dở, KHÔNG tin xác nhận', () => {
    const findings = [finding()];
    const next = applyLayoutResultToMessages(base, {
      messageId: 7, baseHtml: '<p>v0</p>', ackContent: 'x',
      result: { status: 'still_broken', page: page('<p>v1</p>'), changed: true, findings },
    });
    expect(next).toHaveLength(2);
    expect(next[1].data).toMatchObject({ html: '<p>v1</p>', layoutStatus: 'still_broken', layoutFindings: findings });
  });

  it('thẻ đã bị đổi html trong lúc đo (sửa tay xen vào) → BỎ kết quả, trả chính danh sách cũ', () => {
    const edited = [base[0], landing('<p>người dùng vừa sửa</p>', {}, 7)];
    const next = applyLayoutResultToMessages(edited, {
      messageId: 7, baseHtml: '<p>v0</p>',
      result: { status: 'fixed', page: page('<p>v1</p>'), changed: true, findings: [] },
    });
    expect(next).toBe(edited);
  });

  it('không tìm thấy thẻ → trả chính danh sách cũ', () => {
    expect(applyLayoutResultToMessages(base, { messageId: 99, baseHtml: '<p>khác</p>', result: { status: 'clean' } })).toBe(base);
  });
});

describe('setLayoutStatusOnMessages / patchLandingMessageData / layoutCardKey', () => {
  const list = [landing('<p>A</p>', { layoutFindings: [finding()] }, 3), landing('<p>B</p>', {}, 4)];

  it('đặt trạng thái cho đúng thẻ và xoá findings cũ; thẻ đã đổi html thì không đụng', () => {
    const next = setLayoutStatusOnMessages(list, { messageId: 3, html: '<p>A</p>', status: 'checking' });
    expect(next[0].data).toMatchObject({ layoutStatus: 'checking', layoutFindings: [] });
    expect(next[1]).toBe(list[1]);
    expect(setLayoutStatusOnMessages(list, { messageId: 3, html: '<p>đã đổi</p>', status: 'checking' })).toBe(list);
  });

  it('patch theo id → theo index → theo html; không thấy → trả chính danh sách', () => {
    expect(patchLandingMessageData(list, { messageId: 4 }, { canRevert: false })[1].data.canRevert).toBe(false);
    expect(patchLandingMessageData(list, { messageId: null, index: 0 }, { x: 1 })[0].data.x).toBe(1);
    expect(patchLandingMessageData(list, { html: '<p>B</p>' }, { y: 2 })[1].data.y).toBe(2);
    expect(patchLandingMessageData(list, { messageId: 99, index: 5, html: 'zzz' }, { z: 3 })).toBe(list);
    // index trỏ vào tin KHÔNG phải landing thì không ghi nhầm
    const mixed = [{ role: 'user', content: 'x' }, ...list];
    expect(patchLandingMessageData(mixed, { index: 0 }, { z: 3 })).toBe(mixed);
  });

  it('layoutCardKey phân biệt phiên/tin; thiếu thì dùng "new"/"latest"', () => {
    expect(layoutCardKey(5, 9)).toBe('5:9');
    expect(layoutCardKey(null, null)).toBe('new:latest');
    expect(layoutCardKey(5, 9)).not.toBe(layoutCardKey(5, 10));
  });
});
