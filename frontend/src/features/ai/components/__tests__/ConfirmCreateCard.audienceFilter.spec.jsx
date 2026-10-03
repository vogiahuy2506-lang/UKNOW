/**
 * F2.2 (rà soát C P1-3) — thẻ xác nhận phải cho người dùng THẤY bộ lọc người nhận.
 * Trước đây thẻ chỉ ghi "Người nhận: Lấy dữ liệu khách hàng" nên "đã mua khoá A mà chưa mua khoá B" và "mọi khách có email"
 * trông giống hệt nhau. Server nay trả `recipients.filters` (kèm TÊN khoá học); thẻ hiện thành một dòng.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfirmCreateCard } from '../AiChatbotCards';
import { describeAudienceFilter } from '../../utils/audienceFilter';
import viDict from '../../../../i18n/vi';
import enDict from '../../../../i18n/en';

/** `t` đọc thẳng từ từ điển thật + nội suy `{param}` như useI18n — kiểm bản dịch thật, không phải khoá giả. */
const makeT = (dict) => (key, params = {}) => {
  let current = dict;
  for (const part of key.split('.')) current = current?.[part];
  const text = typeof current === 'string' ? current : key;
  return text.replace(/\{(\w+)\}/g, (_, name) => (params[name] !== undefined ? String(params[name]) : `{${name}}`));
};

const viewWithFilters = (filters) => ({
  campaign: { name: 'Email khách đã mua', description: '' },
  readyToCreate: true,
  totals: { sendSteps: 1 },
  blockingIssues: [],
  steps: [{
    key: 'email-1:0',
    nodeId: 'email-1',
    stepIndex: 0,
    channel: 'email',
    title: 'Gửi email',
    timing: { anchor: 'start', value: 0, unit: 'days' },
    sender: { id: 1, label: 'shop@example.vn' },
    recipients: { mode: 'source', type: null, count: null, sourceLabel: 'Lấy dữ liệu khách hàng', ...(filters ? { filters } : {}) },
    content: { subject: 'Mời học tiếp', bodyText: 'Xin chào', attachments: [] },
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

describe('ConfirmCreateCard — dòng bộ lọc người nhận', () => {
  it('"đã mua khoá Excel, chưa mua khoá Photoshop, tối đa 50" → hiện đủ loại khách + TÊN khoá + khoá bị loại + giới hạn', () => {
    renderCard(viewWithFilters({
      customerType: 'purchased',
      limit: 50,
      courses: [{ id: 3, name: 'Khoá Excel nâng cao' }],
      excludedCourses: [{ id: 4, name: 'Khoá Photoshop' }],
    }));

    expect(screen.getByText('Người nhận: Lấy dữ liệu khách hàng')).toBeInTheDocument();
    const line = screen.getByText(/Bộ lọc người nhận:/);
    expect(line.textContent).toBe('Bộ lọc người nhận: Đã mua · khoá: Khoá Excel nâng cao · trừ người đã mua: Khoá Photoshop · tối đa 50 khách');
  });

  it('chưa tra được tên khoá → hiện #id, KHÔNG ẩn bộ lọc', () => {
    renderCard(viewWithFilters({ customerType: null, limit: null, courses: [{ id: 999, name: null }], excludedCourses: [] }));

    expect(screen.getByText(/Bộ lọc người nhận:/).textContent).toBe('Bộ lọc người nhận: khoá: #999');
  });

  it('không có bộ lọc → KHÔNG có dòng "Bộ lọc người nhận"', () => {
    renderCard(viewWithFilters(null));

    expect(screen.queryByText(/Bộ lọc người nhận/)).not.toBeInTheDocument();
  });

  it('giao diện tiếng Anh dùng bản dịch tiếng Anh', () => {
    renderCard(viewWithFilters({
      customerType: 'interested',
      limit: null,
      courses: [{ id: 3, name: 'Excel Advanced' }],
      excludedCourses: [],
    }), enDict, 'en');

    expect(screen.getByText(/Recipient filter:/).textContent).toBe('Recipient filter: Interested (not purchased) · courses: Excel Advanced');
  });
});

describe('describeAudienceFilter', () => {
  const t = makeT(viDict);

  it('null / không phải object → chuỗi rỗng', () => {
    expect(describeAudienceFilter(null, t)).toBe('');
    expect(describeAudienceFilter('x', t)).toBe('');
  });

  it('chỉ có giới hạn → chỉ dòng giới hạn; nhiều khoá → nối bằng dấu phẩy', () => {
    expect(describeAudienceFilter({ customerType: null, limit: 20, courses: [], excludedCourses: [] }, t)).toBe('tối đa 20 khách');
    expect(describeAudienceFilter({
      customerType: 'interested', limit: null, courses: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }], excludedCourses: [],
    }, t)).toBe('Quan tâm (chưa mua) · khoá: A, B');
  });
});
