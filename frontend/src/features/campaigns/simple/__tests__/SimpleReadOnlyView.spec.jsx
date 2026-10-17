import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import SimpleReadOnlyView from '../SimpleReadOnlyView';
import { buildViewFromServer } from '../simpleCampaign.edit.helpers';
import { createInitialWizardState } from '../simpleCampaign.helpers';
import { makeT } from '../../../../test/realI18n.js';

// D3 (PLAN_TUNG_BUOC_MO_RONG_SUA_DUOC_2026-10-17): màn chỉ xem hiện nội dung chiến dịch khi bị chặn chỉ vì nhịp chờ.

const t = makeT(null, 'vi');
const tEn = makeT(null, 'en');
const tpl = (id) => ({ mode: 'template', templateId: id });

const viewData = (patch = {}) => ({
  channel: 'zalo',
  campaignName: 'Chiến dịch Z',
  schedules: [],
  view: {
    senderId: 9,
    audience: { type: 'manual', phones: ['0912345678'] },
    content: tpl(21),
    firstStepDelay: { delayValue: 0, delayUnit: '', delayFrom: '' },
    followUps: [],
    ...patch,
  },
});

function renderView(data, { names = {}, translate = t } = {}) {
  const view = buildViewFromServer(data);
  view.steps = view.steps.map((step) => ({
    ...step,
    content: { ...step.content, templateName: names[step.content.templateId] || '' },
  }));
  const wizard = {
    state: createInitialWizardState(),
    editInfo: {
      hasForm: false, readOnly: true, running: false, view, reasons: [{ code: 'delay_from_start', message: 'Lý do chặn.' }],
    },
  };
  return render(<SimpleReadOnlyView wizard={wizard} canOpenBuilder onOpenBuilder={() => {}} t={translate} locale="vi" />);
}

const stepLines = () => within(screen.getByTestId('simple-readonly-steps')).getAllByTestId('simple-readonly-step').map((li) => li.textContent);

describe('SimpleReadOnlyView — có view (chỉ bị chặn vì nhịp chờ)', () => {
  it('hiện câu tóm tắt + danh sách tin; "đếm từ tin đầu" ghi "sau tin đầu", "sau tin trước" ghi đúng', () => {
    renderView(viewData({
      followUps: [
        { delayValue: 2, delayUnit: 'days', delayFrom: 'start', content: tpl(22) },
        { delayValue: 5, delayUnit: 'hours', delayFrom: 'prev', content: tpl(23) },
      ],
    }), { names: { 21: 'Chào mừng', 22: 'Nhắc lần 1', 23: 'Nhắc lần 2' } });
    expect(screen.getByTestId('simple-readonly-summary')).toHaveTextContent('Chào mừng');
    expect(stepLines()).toEqual([
      'Tin 1 · Chào mừng · gửi ngay',
      'Tin 2 · Nhắc lần 1 · 2 ngày sau tin đầu',
      'Tin 3 · Nhắc lần 2 · 5 giờ sau tin trước',
    ]);
    expect(screen.getByTestId('simple-readonly-reasons')).toHaveTextContent('Lý do chặn.');
  });

  it('đơn vị phút hiện "phút"; đơn vị lạ hiện nguyên chữ đã lưu', () => {
    renderView(viewData({
      followUps: [
        { delayValue: 30, delayUnit: 'minutes', delayFrom: 'prev', content: tpl(22) },
        { delayValue: 2, delayUnit: 'weeks', delayFrom: 'start', content: tpl(23) },
      ],
    }));
    expect(stepLines()).toEqual([
      'Tin 1 · mẫu đã chọn · gửi ngay',
      'Tin 2 · mẫu đã chọn · 30 phút sau tin trước',
      'Tin 3 · mẫu đã chọn · 2 weeks sau tin đầu',
    ]);
  });

  it('tin 1 có chờ → "sau khi bắt đầu"', () => {
    renderView(viewData({ firstStepDelay: { delayValue: 3, delayUnit: 'hours', delayFrom: 'start' } }));
    expect(stepLines()).toEqual(['Tin 1 · mẫu đã chọn · 3 giờ sau khi bắt đầu']);
  });

  it('bản tiếng Anh: số ít/nhiều và nhãn đúng', () => {
    renderView(viewData({
      followUps: [
        { delayValue: 1, delayUnit: 'days', delayFrom: 'start', content: tpl(22) },
        { delayValue: 2, delayUnit: 'minutes', delayFrom: 'prev', content: tpl(23) },
      ],
    }), { translate: tEn });
    expect(stepLines()).toEqual([
      'Message 1 · the selected template · sent immediately',
      'Message 2 · the selected template · 1 day after the first message',
      'Message 3 · the selected template · 2 minutes after the previous message',
    ]);
  });

  it('chỉ xem: có nút sang Sơ đồ khối, không có nút lưu / tiếp tục', () => {
    renderView(viewData());
    expect(screen.getByTestId('simple-readonly-open-builder')).toBeInTheDocument();
    expect(screen.queryByTestId('simple-edit-save')).not.toBeInTheDocument();
    expect(screen.queryByTestId('simple-next')).not.toBeInTheDocument();
  });
});

describe('SimpleReadOnlyView — không có view', () => {
  it('không form, không view → như cũ: chỉ lý do + nút, không tóm tắt, không danh sách tin', () => {
    const wizard = {
      state: createInitialWizardState(),
      editInfo: { hasForm: false, readOnly: true, running: false, view: null, reasons: [{ code: 'not_simple', message: 'Có khối nâng cao.' }] },
    };
    render(<SimpleReadOnlyView wizard={wizard} canOpenBuilder onOpenBuilder={() => {}} t={t} locale="vi" />);
    expect(screen.queryByTestId('simple-readonly-summary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('simple-readonly-steps')).not.toBeInTheDocument();
    expect(screen.getByTestId('simple-readonly-reasons')).toHaveTextContent('Có khối nâng cao.');
  });
});
