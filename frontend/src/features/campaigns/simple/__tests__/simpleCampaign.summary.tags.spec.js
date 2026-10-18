import { describe, expect, it } from 'vitest';
import vi from '../../../../i18n/vi';
import { createInitialWizardState } from '../simpleCampaign.helpers';
import { buildReviewSummary } from '../simpleCampaign.summary';

const t = (key, params = {}) => {
  const raw = key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), vi);
  if (typeof raw !== 'string') return key;
  return raw.replace(/\{(\w+)\}/g, (_, name) => (params[name] === undefined ? `{${name}}` : String(params[name])));
};

const state = (audience) => ({
  ...createInitialWizardState(),
  channel: 'email',
  sender: { id: 11, label: 'shop@abc.vn' },
  audience: { ...createInitialWizardState().audience, type: 'customers', ...audience },
  content: { mode: 'template', templateId: 5, templateName: 'Mẫu 1', subject: '', body: '' },
});

describe('buildReviewSummary — khách đã lưu có tag (PR-T3)', () => {
  it('nêu TÊN tag người dùng chọn và số người nhận do server đếm', () => {
    const text = buildReviewSummary({ state: state({ tagIds: [4, 9], tagNames: ['Khách VIP', 'Quan tâm Excel'] }), preview: { recipientCount: 15 }, t, locale: 'vi' });
    expect(text).toContain('15 khách hàng đã lưu có tag “Khách VIP”, “Quan tâm Excel”');
  });

  it('thiếu tên (state cũ) -> #id, không bao giờ ẩn bộ lọc', () => {
    const text = buildReviewSummary({ state: state({ tagIds: [4], tagNames: [] }), preview: { recipientCount: 3 }, t, locale: 'vi' });
    expect(text).toContain('khách hàng đã lưu có tag “#4”');
  });

  it('không chọn tag -> câu cũ "khách hàng đã lưu"', () => {
    const text = buildReviewSummary({ state: state({}), preview: { recipientCount: 40 }, t, locale: 'vi' });
    expect(text).toContain('40 khách hàng đã lưu');
    expect(text).not.toContain('có tag');
  });
});
