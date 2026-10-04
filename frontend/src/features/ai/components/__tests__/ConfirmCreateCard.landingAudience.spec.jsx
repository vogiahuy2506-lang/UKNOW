/**
 * Rà soát C P2-7 — thẻ xác nhận phải nói TRANG LANDING NÀO + bao nhiêu người sẽ nhận (trước đây chỉ ghi "Lead từ Landing Page").
 * Server trả `recipients.landing`; thẻ hiện thành một dòng. Lỗi chặn `landing_audience_unchosen` (slug rỗng mà chưa chọn "Tất cả")
 * hiện bằng chữ tiếng Việt/Anh thật, không phải khoá i18n thô.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfirmCreateCard } from '../AiChatbotCards';
import { describeLandingAudience } from '../../utils/audienceFilter';
import viDict from '../../../../i18n/vi';
import enDict from '../../../../i18n/en';

const makeT = (dict) => (key, params = {}) => {
  let current = dict;
  for (const part of key.split('.')) current = current?.[part];
  const text = typeof current === 'string' ? current : key;
  return text.replace(/\{(\w+)\}/g, (_, name) => (params[name] !== undefined ? String(params[name]) : `{${name}}`));
};

const viewWith = (landing, { blockingIssues = [] } = {}) => ({
  campaign: { name: 'Email người đăng ký', description: '' },
  readyToCreate: blockingIssues.length === 0,
  totals: { sendSteps: 1 },
  blockingIssues,
  steps: [{
    key: 'email-1:0',
    nodeId: 'email-1',
    stepIndex: 0,
    channel: 'email',
    title: 'Gửi email',
    timing: { anchor: 'start', value: 0, unit: 'days' },
    sender: { id: 1, label: 'shop@example.vn' },
    recipients: { mode: 'source', type: null, count: null, sourceLabel: 'Lead từ Landing Page', ...(landing ? { landing } : {}) },
    content: { subject: 'Mời học thử', bodyText: 'Xin chào', attachments: [] },
  }],
});

const renderCard = (view, dict = viDict, locale = 'vi') => render(
  <ConfirmCreateCard
    confirmationView={view}
    onConfirm={vi.fn()}
    onEdit={vi.fn()}
    onCancel={vi.fn()}
    onRetry={vi.fn()}
    isPreparing={false}
    prepareError={null}
    t={makeT(dict)}
    locale={locale}
  />,
);

describe('ConfirmCreateCard — dòng landing nguồn', () => {
  it('chọn 2 landing → "Landing nguồn: Khoá IELTS (120 người), Khoá TOEIC (80 người)"', () => {
    renderCard(viewWith({
      all: false,
      totalLeads: 205,
      pages: [
        { slug: 'khoa-ielts', title: 'Khoá IELTS', recipientCount: 120 },
        { slug: 'khoa-toeic', title: 'Khoá TOEIC', recipientCount: 80 },
      ],
    }));

    expect(screen.getByText(/Landing nguồn:/).textContent).toBe('Landing nguồn: Khoá IELTS (120 người), Khoá TOEIC (80 người)');
  });

  it('"Tất cả landing" → ghi rõ TẤT CẢ kèm tổng lead', () => {
    renderCard(viewWith({ all: true, totalLeads: 205, pages: [] }));

    expect(screen.getByText(/Landing nguồn:/).textContent).toBe('Landing nguồn: TẤT CẢ landing (205 lead)');
  });

  it('chặn tạo vì chưa chọn landing → hiện câu lỗi thật (không phải khoá i18n thô)', () => {
    renderCard(viewWith({ all: true, totalLeads: null, pages: [] }, {
      blockingIssues: [{ code: 'landing_audience_unchosen', nodeId: 'email-1', stepIndex: null, messageKey: 'aiChatbot.confirmation.landing_audience_unchosen' }],
    }));

    expect(screen.getByText(/Chưa chọn landing nào cho người nhận/)).toBeInTheDocument();
    expect(screen.queryByText(/landing_audience_unchosen/)).not.toBeInTheDocument();
  });

  it('không có recipients.landing → KHÔNG có dòng "Landing nguồn"', () => {
    renderCard(viewWith(null));

    expect(screen.queryByText(/Landing nguồn/)).not.toBeInTheDocument();
  });

  it('giao diện tiếng Anh dùng bản dịch tiếng Anh', () => {
    renderCard(viewWith({ all: false, totalLeads: 10, pages: [{ slug: 'a', title: 'Course A', recipientCount: 10 }] }), enDict, 'en');

    expect(screen.getByText(/Source landing pages:/).textContent).toBe('Source landing pages: Course A (10 people)');
  });
});

describe('describeLandingAudience', () => {
  const t = makeT(viDict);

  it('null / không phải object → chuỗi rỗng', () => {
    expect(describeLandingAudience(null, t)).toBe('');
    expect(describeLandingAudience('x', t)).toBe('');
  });

  it('landing đã xoá / chưa tra được tên → hiện slug; chưa tra được số → chỉ ghi tên, KHÔNG bịa số', () => {
    expect(describeLandingAudience({ all: false, pages: [{ slug: 'da-xoa', title: null, recipientCount: null }] }, t)).toBe('da-xoa');
    expect(describeLandingAudience({ all: false, pages: [{ slug: 'a', title: 'Trang A', recipientCount: null }] }, t)).toBe('Trang A');
  });

  it('tất cả nhưng chưa tra được tổng → "TẤT CẢ landing" không kèm số', () => {
    expect(describeLandingAudience({ all: true, totalLeads: null, pages: [] }, t)).toBe('TẤT CẢ landing');
  });

  it('số 0 là số thật: "0 người" vẫn hiện (không bị coi là thiếu)', () => {
    expect(describeLandingAudience({ all: false, pages: [{ slug: 'a', title: 'Trang A', recipientCount: 0 }] }, t)).toBe('Trang A (0 người)');
  });
});
