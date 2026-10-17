import { describe, it, expect } from 'vitest';
import {
  applyChannelChange,
  buildSimpleCampaignBody,
  createFollowUp,
  createInitialWizardState,
  FOLLOW_UP_DELAY_UNITS,
  isFollowUpComplete,
  isStepComplete,
} from '../simpleCampaign.helpers';
import { buildReviewSummary } from '../simpleCampaign.summary';

// PLAN_HAI_TAB_TUNG_BUOC_SO_DO_2026-10-17, PR-C: hàm thuần của chuỗi tin.

const fu = (patch = {}, content = {}) => ({
  ...createFollowUp(),
  delayValue: 2,
  delayUnit: 'days',
  ...patch,
  content: { mode: 'custom', templateId: null, templateName: '', subject: 'S', body: 'B', ...content },
});

const emailState = (followUps = []) => ({
  ...createInitialWizardState(),
  channel: 'email',
  sender: { id: 11, label: 'shop@abc.vn' },
  audience: { ...createInitialWizardState().audience, type: 'form', formIds: [7], formTitles: ['Đăng ký'] },
  content: { mode: 'template', templateId: 5, templateName: 'Mẫu 1', subject: '', body: '' },
  followUps,
});

describe('buildSimpleCampaignBody — followUps', () => {
  it('không có tin sau → không có trường followUps', () => {
    expect(buildSimpleCampaignBody(emailState())).not.toHaveProperty('followUps');
  });

  it('đúng thứ tự, đủ delayValue + delayUnit; email tự soạn có subject ở MỌI tin; mẫu chỉ có templateId', () => {
    const body = buildSimpleCampaignBody(emailState([
      fu({ delayValue: '3', delayUnit: 'hours' }, { mode: 'template', templateId: 9, subject: '', body: '' }),
      fu({ delayValue: 1, delayUnit: 'days' }, { subject: '  Tiêu đề 3 ', body: ' Thân 3 ' }),
    ]));
    expect(body.followUps).toEqual([
      { delayValue: 3, delayUnit: 'hours', content: { mode: 'template', templateId: 9 } },
      { delayValue: 1, delayUnit: 'days', content: { mode: 'custom', subject: 'Tiêu đề 3', body: 'Thân 3' } },
    ]);
  });

  it('kênh Zalo tự soạn: tin sau không có subject', () => {
    const state = { ...emailState([fu()]), channel: 'zalo_personal', content: { mode: 'custom', templateId: null, templateName: '', subject: '', body: 'x' } };
    expect(buildSimpleCampaignBody(state).followUps[0].content).toEqual({ mode: 'custom', body: 'B' });
  });
});

describe('isStepComplete(content) — chuỗi tin', () => {
  it('mọi tin đủ → true', () => {
    expect(isStepComplete('content', emailState([fu()]))).toBe(true);
  });

  it('email: tin sau tự soạn thiếu tiêu đề → false', () => {
    expect(isStepComplete('content', emailState([fu({}, { subject: '  ' })]))).toBe(false);
  });

  it('tin sau thiếu nội dung / chưa chọn mẫu → false', () => {
    expect(isStepComplete('content', emailState([fu({}, { body: '' })]))).toBe(false);
    expect(isStepComplete('content', emailState([fu({}, { mode: 'template', templateId: null })]))).toBe(false);
    expect(isStepComplete('content', emailState([createFollowUp()]))).toBe(false);
  });

  it('độ trễ ≤ 0 / rỗng / số lẻ / đơn vị lạ → false', () => {
    for (const delayValue of [0, -2, '', '1.5', 'abc']) {
      expect(isStepComplete('content', emailState([fu({ delayValue })]))).toBe(false);
    }
    expect(isStepComplete('content', emailState([fu({ delayUnit: 'weeks' })]))).toBe(false);
  });
});

describe('applyChannelChange — chuỗi tin', () => {
  it('email → Zalo: xoá templateId (và tên) của MỌI tin dùng mẫu, giữ chữ tự soạn', () => {
    const state = emailState([
      fu({}, { mode: 'template', templateId: 9, templateName: 'Mẫu 2' }),
      fu({}, { subject: 'Giữ', body: 'Giữ nội dung' }),
      fu({}, { mode: 'template', templateId: 10, templateName: 'Mẫu 4' }),
    ]);
    const next = applyChannelChange(state, 'zalo_personal');
    expect(next.content.templateId).toBeNull();
    expect(next.followUps[0].content).toMatchObject({ mode: 'template', templateId: null, templateName: '' });
    expect(next.followUps[1].content).toMatchObject({ mode: 'custom', subject: 'Giữ', body: 'Giữ nội dung' });
    expect(next.followUps[2].content).toMatchObject({ mode: 'template', templateId: null, templateName: '' });
  });

  it('Zalo cá nhân → Zalo nhóm cùng kho mẫu: giữ nguyên templateId của các tin sau', () => {
    const state = { ...emailState([fu({}, { mode: 'template', templateId: 9 })]), channel: 'zalo_personal' };
    const next = applyChannelChange(state, 'zalo_group');
    expect(next.followUps[0].content.templateId).toBe(9);
  });
});

describe('buildReviewSummary — chuỗi tin', () => {
  const t = (key, params = {}) => {
    const map = {
      'simpleCampaign.review.summary': 'S[{content}]',
      'simpleCampaign.review.content.template': '“{name}”',
      'simpleCampaign.review.content.chain': '{first}, chuỗi {count} tin trong {span}',
      'simpleCampaign.review.content.span.daysOne': '{n} ngày',
      'simpleCampaign.review.content.span.daysMany': '{n} ngày',
      'simpleCampaign.review.content.span.hoursOne': '{n} giờ',
      'simpleCampaign.review.content.span.hoursMany': '{n} giờ',
      'simpleCampaign.review.content.span.minutesOne': '{n} phút',
      'simpleCampaign.review.content.span.minutesMany': '{n} phút',
    };
    const text = map[key] ?? key;
    return text.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ''));
  };
  const summary = (followUps) => buildReviewSummary({ state: emailState(followUps), preview: null, t, locale: 'vi' });

  it('2 + 3 ngày, 3 tin → "chuỗi 3 tin trong 5 ngày"', () => {
    expect(summary([fu({ delayValue: 2 }), fu({ delayValue: 3 })])).toContain('chuỗi 3 tin trong 5 ngày');
  });

  it('có giờ: làm tròn lên ngày; dưới 1 ngày thì nêu giờ', () => {
    expect(summary([fu({ delayValue: 1 }), fu({ delayValue: 5, delayUnit: 'hours' })])).toContain('trong 2 ngày');
    expect(summary([fu({ delayValue: 5, delayUnit: 'hours' })])).toContain('chuỗi 2 tin trong 5 giờ');
  });

  it('có phút: 2 tin cách 30 phút → "trong 30 phút"; 90 phút → 2 giờ; ngày + phút → làm tròn lên ngày', () => {
    expect(summary([fu({ delayValue: 30, delayUnit: 'minutes' })])).toContain('chuỗi 2 tin trong 30 phút');
    expect(summary([fu({ delayValue: 1, delayUnit: 'minutes' })])).toContain('chuỗi 2 tin trong 1 phút');
    expect(summary([fu({ delayValue: 90, delayUnit: 'minutes' })])).toContain('chuỗi 2 tin trong 2 giờ');
    expect(summary([fu({ delayValue: 1 }), fu({ delayValue: 30, delayUnit: 'minutes' })])).toContain('chuỗi 3 tin trong 2 ngày');
    expect(summary([fu({ delayValue: 20, delayUnit: 'minutes' }), fu({ delayValue: 40, delayUnit: 'minutes' })])).toContain('chuỗi 3 tin trong 1 giờ');
  });

  it('FOLLOW_UP_DELAY_UNITS: ngày → giờ → phút; isFollowUpComplete nhận phút; body gửi minutes', () => {
    expect([...FOLLOW_UP_DELAY_UNITS]).toEqual(['days', 'hours', 'minutes']);
    const content = { mode: 'template', templateId: 9, templateName: '', subject: '', body: '' };
    expect(isFollowUpComplete('zalo', fu({ delayValue: 10, delayUnit: 'minutes' }, content))).toBe(true);
    expect(isFollowUpComplete('zalo', fu({ delayValue: 10, delayUnit: 'seconds' }, content))).toBe(false);
    expect(buildSimpleCampaignBody(emailState([fu({ delayValue: '15', delayUnit: 'minutes' }, content)])).followUps[0])
      .toMatchObject({ delayValue: 15, delayUnit: 'minutes' });
  });

  it('không có tin sau → không nhắc chuỗi', () => {
    expect(summary([])).not.toContain('chuỗi');
  });
});
