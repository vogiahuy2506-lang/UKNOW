import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import CustomersPanel from '../audience/CustomersPanel';
import customerApiService from '../../../customers/services/customerApi.service';
import { EMPTY_AUDIENCE, buildSimpleCampaignBody } from '../simpleCampaign.helpers';
import vi_ from '../../../../i18n/vi';

vi.mock('../../../customers/services/customerApi.service', () => ({ default: { getCustomers: vi.fn(), getTags: vi.fn() } }));

const t = (key, params = {}) => {
  const raw = key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), vi_);
  if (typeof raw !== 'string') return key;
  return raw.replace(/\{(\w+)\}/g, (_, name) => (params[name] === undefined ? `{${name}}` : String(params[name])));
};

const TAGS = [
  { id: 4, name: 'Khách VIP', color: '#ff0000', customerCount: 12 },
  { id: 9, name: 'Quan tâm Excel', color: null, customerCount: 3 },
];

let latestAudience;
function Harness({ initial = {} }) {
  const [audience, setAudience] = useState({ ...EMPTY_AUDIENCE, type: 'customers', ...initial });
  const patchAudience = useCallback((patch) => setAudience((prev) => ({ ...prev, ...patch })), []);
  latestAudience = audience;
  return (
    <MemoryRouter>
      <CustomersPanel audience={audience} patchAudience={patchAudience} t={t} locale="vi" />
    </MemoryRouter>
  );
}

const customersResponse = (total) => ({ data: { data: { pagination: { total } } } });

describe('CustomersPanel — chỉ gửi cho khách có tag (PR-T3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    customerApiService.getCustomers.mockImplementation(async (params) => customersResponse(params.tagIds ? 5 : 40));
    customerApiService.getTags.mockResolvedValue({ data: { data: TAGS } });
  });

  it('hiện các tag của workspace kèm số khách; chưa chọn tag thì đếm TẤT CẢ khách', async () => {
    render(<Harness />);
    expect(await screen.findByTestId('simple-customers-tag-4')).toHaveTextContent('Khách VIP');
    expect(screen.getByTestId('simple-customers-tag-4')).toHaveTextContent('12');
    expect(screen.getByTestId('simple-customers-tag-9')).toHaveTextContent('Quan tâm Excel');
    expect(await screen.findByTestId('simple-customers-count')).toHaveTextContent('40');
    expect(customerApiService.getCustomers).toHaveBeenLastCalledWith({ page: 1, limit: 1 });
  });

  it('chọn nhiều tag -> tagIds + tagNames vào state, đếm lại THEO tag (tagIds dạng chuỗi phẩy), câu đếm đổi sang "mang tag"', async () => {
    render(<Harness />);
    fireEvent.click(await screen.findByTestId('simple-customers-tag-4'));
    fireEvent.click(screen.getByTestId('simple-customers-tag-9'));
    await waitFor(() => expect(latestAudience.tagIds).toEqual([4, 9]));
    expect(latestAudience.tagNames).toEqual(['Khách VIP', 'Quan tâm Excel']);
    await waitFor(() => expect(customerApiService.getCustomers).toHaveBeenLastCalledWith({ page: 1, limit: 1, tagIds: '4,9' }));
    expect(await screen.findByText(/Có 5 khách mang tag đã chọn/)).toBeInTheDocument();
    expect(screen.getByTestId('simple-customers-tag-4')).toHaveAttribute('aria-pressed', 'true');
    expect(latestAudience.customerTotal).toBe(5);
  });

  it('bỏ chọn / "Bỏ chọn tag" quay về mọi khách', async () => {
    render(<Harness initial={{ tagIds: [4], tagNames: ['Khách VIP'] }} />);
    fireEvent.click(await screen.findByTestId('simple-customers-tags-clear'));
    await waitFor(() => expect(latestAudience.tagIds).toEqual([]));
    await waitFor(() => expect(customerApiService.getCustomers).toHaveBeenLastCalledWith({ page: 1, limit: 1 }));
    expect(await screen.findByTestId('simple-customers-count')).toHaveTextContent('40');
  });

  it('chọn tag mà chưa khách nào mang -> hộp "chưa có khách mang tag" (không phải "chưa lưu khách nào"), customerTotal = 0 chặn bước', async () => {
    customerApiService.getCustomers.mockImplementation(async (params) => customersResponse(params.tagIds ? 0 : 40));
    render(<Harness />);
    fireEvent.click(await screen.findByTestId('simple-customers-tag-9'));
    expect(await screen.findByTestId('simple-customers-empty-tagged')).toBeInTheDocument();
    expect(screen.queryByTestId('simple-customers-empty')).toBeNull();
    await waitFor(() => expect(latestAudience.customerTotal).toBe(0));
  });

  it('workspace chưa có tag nào -> câu gợi ý tạo tag + liên kết trang Khách hàng, KHÔNG có lựa chọn tag', async () => {
    customerApiService.getTags.mockResolvedValue({ data: { data: [] } });
    render(<Harness />);
    const hint = await screen.findByTestId('simple-customers-tags-none');
    expect(hint).toHaveTextContent('tạo tag');
    expect(hint.querySelector('a')).toHaveAttribute('href', '/app/customers');
    expect(screen.queryByTestId('simple-customers-tags')).toBeNull();
    expect(await screen.findByTestId('simple-customers-count')).toBeInTheDocument();
  });

  it('chưa lưu khách nào (không lọc tag) -> chỉ hộp "chưa lưu khách", không bày chọn tag vô nghĩa', async () => {
    customerApiService.getCustomers.mockResolvedValue(customersResponse(0));
    render(<Harness />);
    expect(await screen.findByTestId('simple-customers-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('simple-customers-tags')).toBeNull();
  });

  it('không tải được tag -> báo nhẹ, vẫn đếm và gửi được cho tất cả khách', async () => {
    customerApiService.getTags.mockRejectedValue(new Error('boom'));
    render(<Harness />);
    expect(await screen.findByTestId('simple-customers-tags-error')).toBeInTheDocument();
    expect(await screen.findByTestId('simple-customers-count')).toHaveTextContent('40');
  });

  it('tag đã lưu nhưng đã bị xoá -> vẫn hiện chip #id (đã chọn) để bỏ chọn được; tên đồng bộ về #id', async () => {
    render(<Harness initial={{ tagIds: [4, 77], tagNames: [] }} />);
    const orphan = await screen.findByTestId('simple-customers-tag-77');
    expect(orphan).toHaveTextContent('#77');
    expect(orphan).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(latestAudience.tagNames).toEqual(['Khách VIP', '#77']));
    fireEvent.click(orphan);
    await waitFor(() => expect(latestAudience.tagIds).toEqual([4]));
  });
});

describe('buildSimpleCampaignBody — audience khách đã lưu kèm tag', () => {
  const state = (audience) => ({
    channel: 'email',
    sender: { id: 5, label: 'a@b.vn' },
    audience: { ...EMPTY_AUDIENCE, type: 'customers', ...audience },
    content: { mode: 'template', templateId: 3 },
    campaignName: '',
    followUps: [],
    schedule: { type: 'now' },
  });

  it('có tag -> audience.tagIds (số); không tag -> audience chỉ có type như cũ', () => {
    expect(buildSimpleCampaignBody(state({ tagIds: ['4', 9], tagNames: ['x', 'y'] })).audience).toEqual({ type: 'customers', tagIds: [4, 9] });
    expect(buildSimpleCampaignBody(state({})).audience).toEqual({ type: 'customers' });
    expect(buildSimpleCampaignBody(state({ tagIds: [] })).audience).toEqual({ type: 'customers' });
  });
});
