/**
 * Rà soát C P2-7 — thẻ xác nhận phải nói TRANG LANDING NÀO + bao nhiêu người sẽ nhận (trước đây chỉ ghi "Lead từ Landing Page").
 * Server trả `recipients.landing`; thẻ hiện thành một dòng. Lỗi chặn `landing_audience_unchosen` (slug rỗng mà chưa chọn "Tất cả")
 * hiện bằng chữ tiếng Việt/Anh thật, không phải khoá i18n thô.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfirmCreateCard } from '../AiChatbotCards';
import { describeLandingAudience, describeConversationAudience } from '../../utils/audienceFilter';
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

/**
 * Rà soát C P2-9 — Telegram/WhatsApp nguồn "hội thoại": người nhận là MỌI người đã từng nhắn tới tài khoản (không có danh sách để nhìn) nên thẻ
 * phải nói rõ "N người đã từng nhắn tới tài khoản X". Server trả `recipients.conversations`.
 */
describe('ConfirmCreateCard — dòng người nhận từ hội thoại (Telegram/WhatsApp)', () => {
  const viewWithConversations = (conversations) => {
    const view = viewWith(null);
    view.steps[0] = {
      ...view.steps[0],
      channel: 'telegram',
      sender: { id: 12, label: 'shop_bot' },
      recipients: { mode: 'source', type: null, count: null, sourceLabel: '', ...(conversations ? { conversations } : {}) },
    };
    return view;
  };

  it('"37 người đã từng nhắn tới tài khoản shop_bot"', () => {
    renderCard(viewWithConversations({ count: 37, accountLabel: 'shop_bot' }));

    expect(screen.getByText(/Người nhận:/).textContent).toBe('Người nhận: 37 người đã từng nhắn tới tài khoản shop_bot');
  });

  it('0 là số thật (chưa ai nhắn) — vẫn hiện "0 người", không bị coi là thiếu', () => {
    renderCard(viewWithConversations({ count: 0, accountLabel: 'shop_bot' }));

    expect(screen.getByText(/Người nhận:/).textContent).toBe('Người nhận: 0 người đã từng nhắn tới tài khoản shop_bot');
  });

  it('chưa đếm được → "Tất cả người đã từng nhắn…", KHÔNG bịa số', () => {
    renderCard(viewWithConversations({ count: null, accountLabel: 'shop_bot' }));

    expect(screen.getByText(/Người nhận:/).textContent).toBe('Người nhận: Tất cả người đã từng nhắn tới tài khoản shop_bot');
  });

  it('tiếng Anh dùng bản dịch tiếng Anh; không có recipients.conversations → không có dòng', () => {
    renderCard(viewWithConversations({ count: 3, accountLabel: 'WA Shop' }), enDict, 'en');
    expect(screen.getByText(/Recipients:/).textContent).toBe('Recipients: 3 people who have messaged account WA Shop');
  });

  it('không có recipients.conversations → không có dòng người nhận', () => {
    renderCard(viewWithConversations(null));
    expect(screen.queryByText(/đã từng nhắn/)).not.toBeInTheDocument();
  });

  it('describeConversationAudience: null → chuỗi rỗng', () => {
    expect(describeConversationAudience(null, makeT(viDict))).toBe('');
  });
});
