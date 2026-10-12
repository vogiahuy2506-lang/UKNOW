import { describe, expect, it } from 'vitest';
import {
  alignFormSlotKinds,
  applyAiFormDrafts,
  buildFormDraftsPayload,
  findDraftForSlot,
  listFormSlotKinds,
  mergeFormDrafts,
  realignDraftsOnFormChange,
  realignFormDrafts,
} from '../landingFormDrafts.js';
import { buildFormRows } from '../landingFormLink.js';

/**
 * PR-7a (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11) — nháp biểu mẫu AI theo chỗ trống: sắp hàng theo chuỗi loại, đi theo chỗ trống khi HTML đổi,
 * body gửi lúc Lưu. Bản sao frontend của backend `landingFormDrafts.util.js` — các ca sắp hàng dưới đây GIỐNG HỆT spec backend.
 */
const slot = (kind) => (kind === 'bare' ? '<div data-founderai-form-slot></div>' : `<div data-founderai-form-slot="${kind}"></div>`);
const page = (...kinds) => `<body>${kinds.map((k) => `<section>${slot(k)}</section>`).join('')}</body>`;
const draft = (slotIndex, kind, title = `${kind}-${slotIndex}`) => ({ slotIndex, kind, title });

describe('alignFormSlotKinds — khớp bản backend', () => {
  it.each([
    [['consult', 'booking'], ['consult', 'booking'], [0, 1]],
    [['booking'], ['booking', 'payment'], [0, -1]],
    [['booking'], ['survey', 'booking'], [-1, 0]],
    [['consult', 'payment'], ['consult', 'booking', 'payment'], [0, -1, 1]],
    [['consult', 'booking', 'payment'], ['consult', 'payment'], [0, 2]],
    [['booking'], ['booking', 'booking'], [0, -1]],
    [[], ['booking'], [-1]],
    [['booking'], [], []],
  ])('%j → %j = %j', (a, b, expected) => {
    expect(alignFormSlotKinds(a, b)).toEqual(expected);
  });
});

describe('listFormSlotKinds', () => {
  it('chỗ trống trần = consult, có loại giữ loại, theo thứ tự trong HTML', () => {
    expect(listFormSlotKinds(page('bare', 'booking', 'payment'))).toEqual(['consult', 'booking', 'payment']);
    expect(listFormSlotKinds('')).toEqual([]);
  });
});

describe('realignFormDrafts / mergeFormDrafts / applyAiFormDrafts', () => {
  it('chèn chỗ trống mới ở giữa → nháp phía sau dịch chỉ số; bớt chỗ trống → bỏ nháp của nó; đổi loại → không bám sang', () => {
    expect(
      realignFormDrafts([draft(1, 'booking'), draft(2, 'payment')], page('bare', 'booking', 'payment'), page('bare', 'survey', 'booking', 'payment'))
        .map((d) => [d.slotIndex, d.kind])
    ).toEqual([[2, 'booking'], [3, 'payment']]);
    expect(
      realignFormDrafts([draft(1, 'booking'), draft(2, 'payment')], page('bare', 'booking', 'payment'), page('bare', 'payment')).map((d) => [d.slotIndex, d.kind])
    ).toEqual([[1, 'payment']]);
    expect(realignFormDrafts([draft(0, 'booking')], page('booking'), page('survey'))).toEqual([]);
    expect(realignFormDrafts(undefined, page('booking'), page('booking'))).toEqual([]);
  });

  it('mergeFormDrafts: hợp theo slotIndex, nháp mới thắng, sắp theo slotIndex', () => {
    expect(
      mergeFormDrafts([draft(2, 'payment', 'cu'), draft(0, 'booking')], [draft(2, 'payment', 'moi'), draft(1, 'survey')]).map((d) => [d.slotIndex, d.title])
    ).toEqual([[0, 'booking-0'], [1, 'survey-1'], [2, 'moi']]);
  });

  it('applyAiFormDrafts: sinh mới thay hẳn (kể cả khi server không trả mảng → []); sửa trang hợp; không có mảng → null (không đổi gì)', () => {
    expect(applyAiFormDrafts({ current: [draft(0, 'survey')], incoming: [draft(0, 'booking')], replaceAll: true }).map((d) => d.kind)).toEqual(['booking']);
    expect(applyAiFormDrafts({ current: [draft(0, 'survey')], incoming: undefined, replaceAll: true })).toEqual([]);
    expect(
      applyAiFormDrafts({ current: [draft(0, 'booking')], incoming: [draft(0, 'survey')], previousHtml: page('booking'), nextHtml: page('survey', 'booking') })
        .map((d) => [d.slotIndex, d.kind])
    ).toEqual([[0, 'survey'], [1, 'booking']]);
    expect(applyAiFormDrafts({ current: [draft(0, 'booking')], incoming: undefined, previousHtml: page('booking'), nextHtml: page('booking') })).toBeNull();
  });
});

describe('realignDraftsOnFormChange — bộ bọc setForm', () => {
  const prev = { htmlContent: page('bare', 'booking'), formDrafts: [draft(1, 'booking')] };

  it('HTML đổi làm lệch chỗ trống mà nơi gọi KHÔNG đụng tới formDrafts → nháp đi theo chỗ trống', () => {
    const next = { ...prev, htmlContent: page('bare', 'survey', 'booking') };
    expect(realignDraftsOnFormChange(prev, next).formDrafts.map((d) => [d.slotIndex, d.kind])).toEqual([[2, 'booking']]);
  });

  it('người dùng bỏ chỗ trống booking khỏi danh sách → nháp của nó biến mất', () => {
    const next = { ...prev, htmlContent: page('bare') };
    expect(realignDraftsOnFormChange(prev, next).formDrafts).toEqual([]);
  });

  it('nơi gọi đã tự đặt formDrafts (lượt AI) → giữ nguyên, không sắp hàng lần hai', () => {
    const next = { ...prev, htmlContent: page('bare', 'survey', 'booking'), formDrafts: [draft(2, 'booking')] };
    expect(realignDraftsOnFormChange(prev, next)).toBe(next);
  });

  it('chuỗi loại chỗ trống không đổi (gõ chữ, đổi màu) / không có nháp / cùng đối tượng → trả nguyên đối tượng, không tốn thêm', () => {
    const typed = { ...prev, htmlContent: `${prev.htmlContent}<p>chữ mới</p>` };
    expect(realignDraftsOnFormChange(prev, typed)).toBe(typed);
    const noDrafts = { htmlContent: page('booking'), formDrafts: [] };
    const changed = { ...noDrafts, htmlContent: page('survey', 'booking') };
    expect(realignDraftsOnFormChange(noDrafts, changed)).toBe(changed);
    expect(realignDraftsOnFormChange(prev, prev)).toBe(prev);
  });
});

describe('findDraftForSlot / buildFormDraftsPayload', () => {
  it('findDraftForSlot cần khớp CẢ chỉ số lẫn loại', () => {
    const drafts = [draft(1, 'booking')];
    expect(findDraftForSlot(drafts, 1, 'booking')).toBe(drafts[0]);
    expect(findDraftForSlot(drafts, 1, 'survey')).toBeNull();
    expect(findDraftForSlot(drafts, 0, 'booking')).toBeNull();
    expect(findDraftForSlot(null, 0, 'booking')).toBeNull();
  });

  it('body lưu: chỉ nháp còn khớp một chỗ trống KHÔNG phải consult trong HTML; không có → {} (body y như trước PR-7a)', () => {
    const htmlContent = page('bare', 'booking', 'payment');
    expect(buildFormDraftsPayload({ htmlContent, formDrafts: [draft(1, 'booking'), draft(2, 'payment')] })).toEqual({
      formDrafts: [draft(1, 'booking'), draft(2, 'payment')],
    });
    expect(buildFormDraftsPayload({ htmlContent, formDrafts: [draft(1, 'booking'), draft(2, 'survey'), draft(0, 'consult'), draft(9, 'payment')] })).toEqual({
      formDrafts: [draft(1, 'booking')],
    });
    expect(buildFormDraftsPayload({ htmlContent, formDrafts: [] })).toEqual({});
    expect(buildFormDraftsPayload({ htmlContent })).toEqual({});
    expect(buildFormDraftsPayload({ htmlContent: page('bare'), formDrafts: [draft(1, 'booking')] })).toEqual({});
    expect(buildFormDraftsPayload(null)).toEqual({});
  });
});

describe('buildFormRows — dòng chỗ trống mang nháp AI', () => {
  it('dòng "new" có slotIndex (không đếm khối nhúng) + draft/title của nháp khớp CẢ chỉ số lẫn loại', () => {
    const embed = '<section data-founderai-form-section><div data-founderai-form="K1"></div></section>';
    const html = `<body>${embed}${slot('bare')}${slot('booking')}${slot('payment')}</body>`;
    const rows = buildFormRows({
      html,
      formDrafts: [draft(1, 'booking', 'Đặt lịch khám răng'), draft(2, 'survey', 'Sai loại')],
    });
    const news = rows.filter((r) => r.source === 'new');
    expect(news.map((r) => r.slotIndex)).toEqual([0, 1, 2]);
    expect(news.map((r) => r.title)).toEqual([null, 'Đặt lịch khám răng', null]);
    expect(news[1].draft).toMatchObject({ kind: 'booking' });
    expect(news[0].draft).toBeNull();
    expect(news[2].draft).toBeNull(); // nháp survey không bám vào chỗ trống payment
  });
});
