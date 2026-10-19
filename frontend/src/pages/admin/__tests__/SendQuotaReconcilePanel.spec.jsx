import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../i18n';
import SendQuotaReconcilePanel from '../SendQuotaReconcilePanel';

/**
 * R2 (20/10/2026) — khối "Đặt chỗ hạn mức chờ đối soát": dòng `uncertain` vẫn tính hạn mức + giữ ví của khách cho tới
 * khi NGƯỜI quyết định, nên màn phải liệt kê, cho hai nút (đã gửi / chưa gửi) và luôn hỏi xác nhận trước khi gọi API.
 */
const { mockList, mockReconcile, mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockReconcile: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock('../../../features/admin/services/adminSystemApi.service', () => ({
  default: {
    getUncertainSendQuotaReservations: mockList,
    reconcileSendQuotaReservation: mockReconcile,
  },
}));

vi.mock('react-hot-toast', () => ({
  default: { success: mockToastSuccess, error: mockToastError },
}));

const row = (over = {}) => ({
  id: '11',
  billingUserId: 5,
  billingEmail: 'chu@goi.vn',
  billingName: 'Chủ Gói',
  actorUserId: null,
  channel: 'email',
  sourceType: 'direct_email',
  quantity: 1,
  walletQuantity: 0,
  walletItemKey: null,
  createdAt: '2026-10-19T01:00:00.000Z',
  sendingAt: '2026-10-19T01:00:05.000Z',
  uncertainAt: '2026-10-19T01:40:00.000Z',
  failureCode: 'sending_stale',
  providerReference: null,
  hasMessageEvidence: false,
  evidenceTables: [],
  ...over,
});

const listResponse = (items) => ({ data: { data: { items, total: items.length, limit: 50, offset: 0 } } });

const renderPanel = () =>
  render(
    <I18nProvider>
      <SendQuotaReconcilePanel />
    </I18nProvider>
  );

describe('SendQuotaReconcilePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReconcile.mockResolvedValue({ data: { success: true, data: { status: 'consumed' } } });
  });

  it('có dòng → hiện số dòng, bảng, gợi ý bằng chứng đúng từng dòng và hai nút quyết định', async () => {
    mockList.mockResolvedValue(listResponse([
      row({ id: '11', hasMessageEvidence: true, evidenceTables: ['email_messages'], walletQuantity: 1, walletItemKey: 'emails' }),
      row({ id: '12', billingEmail: 'khac@goi.vn', billingName: null }),
    ]));
    renderPanel();

    expect(await screen.findByTestId('reconcile-row-11')).toBeInTheDocument();
    expect(screen.getByTestId('reconcile-count')).toHaveTextContent('2 dòng');
    expect(screen.getByTestId('reconcile-evidence-11')).toHaveTextContent('Có dòng tin đã gắn');
    expect(screen.getByTestId('reconcile-evidence-12')).toHaveTextContent('Chưa thấy dòng tin nào');
    expect(within(screen.getByTestId('reconcile-row-11')).getByText('Giữ ví: 1')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Đã gửi — tính hạn mức/trừ ví' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Chưa gửi — trả lại' })).toHaveLength(2);
    expect(screen.queryByTestId('reconcile-empty')).not.toBeInTheDocument();
  });

  it('không có dòng nào → một dòng "Không có đặt chỗ nào chờ đối soát."', async () => {
    mockList.mockResolvedValue(listResponse([]));
    renderPanel();

    expect(await screen.findByTestId('reconcile-empty')).toHaveTextContent('Không có đặt chỗ nào chờ đối soát.');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('bấm "Đã gửi" → hộp xác nhận (chưa gọi API); nhập ghi chú rồi xác nhận → gọi API outcome=sent kèm ghi chú, tải lại danh sách', async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValueOnce(listResponse([row()])).mockResolvedValueOnce(listResponse([]));
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Đã gửi — tính hạn mức/trừ ví' }));
    expect(screen.getByText('Xác nhận lượt gửi này ĐÃ được gửi?')).toBeInTheDocument();
    expect(mockReconcile).not.toHaveBeenCalled();

    // ConfirmModal tự focus khung hộp sau 50ms khi mở; chờ qua mốc đó như người thật (bấm vào ô rồi mới gõ).
    await new Promise((resolve) => { setTimeout(resolve, 100); });
    await user.type(screen.getByTestId('reconcile-note'), 'Đã đối chiếu SMTP');
    await user.click(screen.getByRole('button', { name: 'Xác nhận đã gửi' }));

    await waitFor(() => expect(mockReconcile).toHaveBeenCalledTimes(1));
    expect(mockReconcile).toHaveBeenCalledWith('11', { outcome: 'sent', note: 'Đã đối chiếu SMTP' });
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Đã ghi nhận: đã gửi'));
    expect(await screen.findByTestId('reconcile-empty')).toBeInTheDocument();
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it('bấm "Chưa gửi" → xác nhận → gọi API outcome=not_sent; dòng có bằng chứng thì hộp xác nhận cảnh báo', async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValue(listResponse([row({ hasMessageEvidence: true, evidenceTables: ['email_messages'] })]));
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Chưa gửi — trả lại' }));
    expect(screen.getByText('Xác nhận lượt gửi này CHƯA được gửi?')).toBeInTheDocument();
    expect(screen.getByText(/đang có dòng tin gắn vào/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Xác nhận chưa gửi' }));

    await waitFor(() => expect(mockReconcile).toHaveBeenCalledWith('11', { outcome: 'not_sent', note: '' }));
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Đã trả lại đặt chỗ'));
  });

  it('dòng không có bằng chứng → "Chưa gửi" không hiện cảnh báo bằng chứng', async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValue(listResponse([row()]));
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Chưa gửi — trả lại' }));

    expect(screen.queryByText(/đang có dòng tin gắn vào/)).not.toBeInTheDocument();
  });

  it('huỷ ở hộp xác nhận → KHÔNG gọi API, hộp đóng', async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValue(listResponse([row()]));
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Đã gửi — tính hạn mức/trừ ví' }));
    await user.click(screen.getByRole('button', { name: 'Huỷ' }));

    expect(mockReconcile).not.toHaveBeenCalled();
    expect(screen.queryByTestId('confirm-modal')).not.toBeInTheDocument();
  });

  it('API trả 409 (đã có người xử lý) → báo "không còn chờ đối soát" và tải lại danh sách', async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValueOnce(listResponse([row()])).mockResolvedValueOnce(listResponse([]));
    mockReconcile.mockRejectedValue({ response: { status: 409, data: { code: 'RESERVATION_NOT_UNCERTAIN' } } });
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Đã gửi — tính hạn mức/trừ ví' }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận đã gửi' }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining('không còn ở trạng thái chờ đối soát')));
    expect(await screen.findByTestId('reconcile-empty')).toBeInTheDocument();
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it('không tải được danh sách → báo lỗi, không hiện "không có đặt chỗ nào" (tránh trấn an sai)', async () => {
    mockList.mockRejectedValue(new Error('network'));
    renderPanel();

    expect(await screen.findByText('Không tải được danh sách đặt chỗ chờ đối soát')).toBeInTheDocument();
    expect(screen.queryByTestId('reconcile-empty')).not.toBeInTheDocument();
  });
});
