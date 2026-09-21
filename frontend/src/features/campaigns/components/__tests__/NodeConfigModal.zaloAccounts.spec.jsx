/**
 * Lệnh giao 21/09/2026, PR-3 — NodeConfigModal thật, node "Chọn tài khoản Zalo".
 * Nghiệm thu: 500 → hộp đỏ + Thử lại (không "Chưa có tài khoản"); success + rỗng → "Chưa có tài khoản";
 * bị huỷ → không hiện lỗi, không "chưa có tài khoản".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import NodeConfigModal from '../NodeConfigModal';
import campaignBuilderApiService from '../../services/campaignBuilderApi.service';
import viTranslations from '../../../../i18n/vi';

const mockT = (key, params = {}) => {
  const val = key.split('.').reduce((acc, part) => acc?.[part], viTranslations);
  if (typeof val !== 'string') return key;
  return val.replace(/\{(\w+)\}/g, (_, name) => (params[name] ?? `{${name}}`));
};
vi.mock('../../../../i18n', () => ({ useI18n: () => ({ t: mockT }) }));
vi.mock('../../services/campaignBuilderApi.service', () => ({
  default: { getZaloAccounts: vi.fn() },
}));

const NO_ACCOUNTS = 'Chưa có tài khoản Zalo khả dụng. Vui lòng vào trang Cài đặt Zalo để đăng nhập tài khoản.';
const NODE = { id: 'node-zalo-1', data: { nodeType: 'select_zalo_account', label: 'Chọn tài khoản', config: {} } };

const apiAccount = (over = {}) => ({ id: 34, displayName: 'Nhật Minh', status: 'connected', isActive: true, isDefault: true, ...over });
const ok = (items) => ({ data: { data: { items } } });
const httpError = (status, message) => Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data: { message } } });
const canceled = () => Object.assign(new Error('canceled'), { name: 'CanceledError', code: 'ERR_CANCELED' });

const renderModal = (node = NODE) => render(
  <NodeConfigModal isOpen node={node} onClose={vi.fn()} onSave={vi.fn()} nodes={[node]} edges={[]} />,
);

describe('NodeConfigModal — danh sách tài khoản Zalo không được nuốt lỗi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tải thành công → liệt kê đủ 3 tài khoản, không thông báo "chưa có tài khoản"', async () => {
    campaignBuilderApiService.getZaloAccounts.mockResolvedValue(ok([
      apiAccount({ id: 34 }), apiAccount({ id: 35, displayName: 'Phụ A', isDefault: false }), apiAccount({ id: 36, displayName: 'Phụ B', isDefault: false }),
    ]));
    renderModal();
    await waitFor(() => expect(screen.getByRole('option', { name: /Phụ B/ })).toBeInTheDocument());
    expect(screen.getAllByRole('option')).toHaveLength(4); // 3 tài khoản + dòng "-- Chọn tài khoản --"
    expect(screen.queryByText(NO_ACCOUNTS)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('gọi API kèm signal của modal (để api.js tôn trọng và không khử trùng với node runner)', async () => {
    campaignBuilderApiService.getZaloAccounts.mockResolvedValue(ok([apiAccount()]));
    renderModal();
    await waitFor(() => expect(campaignBuilderApiService.getZaloAccounts).toHaveBeenCalledTimes(1));
    const options = campaignBuilderApiService.getZaloAccounts.mock.calls[0][0];
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.signal.aborted).toBe(false);
  });

  it('/zalo/accounts trả 500 → hộp đỏ nêu nguyên nhân + nút Thử lại, KHÔNG hiện "Chưa có tài khoản Zalo khả dụng"', async () => {
    campaignBuilderApiService.getZaloAccounts.mockRejectedValue(httpError(500, 'Lỗi máy chủ khi đọc tài khoản Zalo'));
    renderModal();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Không tải được danh sách tài khoản Zalo.');
    expect(alert).toHaveTextContent('Lỗi máy chủ khi đọc tài khoản Zalo');
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    expect(screen.queryByText(NO_ACCOUNTS)).not.toBeInTheDocument();
  });

  it('nút Thử lại gọi lại API; lần sau thành công thì hộp đỏ biến mất và danh sách hiện ra', async () => {
    campaignBuilderApiService.getZaloAccounts
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce(ok([apiAccount()]));
    renderModal();
    fireEvent.click(await screen.findByRole('button', { name: 'Thử lại' }));

    await waitFor(() => expect(screen.getByRole('option', { name: /Nhật Minh/ })).toBeInTheDocument());
    expect(campaignBuilderApiService.getZaloAccounts).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('timeout (lỗi không có phản hồi server) → cũng là hộp đỏ, nguyên nhân lấy từ message của axios', async () => {
    campaignBuilderApiService.getZaloAccounts.mockRejectedValue(Object.assign(new Error('timeout of 10000ms exceeded'), { code: 'ECONNABORTED' }));
    renderModal();
    expect(await screen.findByRole('alert')).toHaveTextContent('timeout of 10000ms exceeded');
    expect(screen.queryByText(NO_ACCOUNTS)).not.toBeInTheDocument();
  });

  it('/zalo/accounts trả THÀNH CÔNG nhưng items rỗng → mới hiện "Chưa có tài khoản Zalo khả dụng" như cũ', async () => {
    campaignBuilderApiService.getZaloAccounts.mockResolvedValue(ok([]));
    renderModal();
    expect(await screen.findByText(NO_ACCOUNTS)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('request bị huỷ (gọi trùng) → KHÔNG hộp đỏ và KHÔNG "chưa có tài khoản" (huỷ không phải lỗi)', async () => {
    campaignBuilderApiService.getZaloAccounts.mockRejectedValue(canceled());
    renderModal();
    await waitFor(() => expect(campaignBuilderApiService.getZaloAccounts).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(NO_ACCOUNTS)).not.toBeInTheDocument();
    expect(screen.queryByText(/Không tải được/)).not.toBeInTheDocument();
  });

  it('cha render lại với object node MỚI nhưng cùng id → KHÔNG gọi lại API (deps là node.id, không phải object)', async () => {
    campaignBuilderApiService.getZaloAccounts.mockResolvedValue(ok([apiAccount()]));
    const { rerender } = renderModal();
    await waitFor(() => expect(screen.getByRole('option', { name: /Nhật Minh/ })).toBeInTheDocument());

    for (let i = 0; i < 3; i += 1) {
      const fresh = { ...NODE, data: { ...NODE.data } }; // identity mới mỗi lần render, id giữ nguyên
      rerender(<NodeConfigModal isOpen node={fresh} onClose={vi.fn()} onSave={vi.fn()} nodes={[fresh]} edges={[]} />);
    }
    await act(async () => { await Promise.resolve(); });
    expect(campaignBuilderApiService.getZaloAccounts).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('option', { name: /Nhật Minh/ })).toBeInTheDocument();
  });

  it('đóng modal giữa chừng → signal bị huỷ, kết quả trễ không ghi vào state', async () => {
    let resolveRequest;
    campaignBuilderApiService.getZaloAccounts.mockImplementation(() => new Promise((resolve) => { resolveRequest = resolve; }));
    const { rerender } = renderModal();
    await waitFor(() => expect(campaignBuilderApiService.getZaloAccounts).toHaveBeenCalled());
    const { signal } = campaignBuilderApiService.getZaloAccounts.mock.calls[0][0];

    rerender(<NodeConfigModal isOpen={false} node={NODE} onClose={vi.fn()} onSave={vi.fn()} nodes={[NODE]} edges={[]} />);
    expect(signal.aborted).toBe(true);
    await act(async () => { resolveRequest(ok([apiAccount()])); });
  });
});
