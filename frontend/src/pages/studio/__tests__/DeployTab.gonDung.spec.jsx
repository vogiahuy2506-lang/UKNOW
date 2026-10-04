/**
 * 04/10/2026 — Cột "Triển khai" gọn (phần b báo cáo rà soát Studio):
 *  - S-09: MỘT tiêu đề "Đưa chatbot tới khách" (bản cũ: thanh tab một nút + tiêu đề, chữ "Triển khai" lặp hai lần, và một
 *          biểu tượng bảng màu không nhãn); đổi màu/vị trí là một dòng CÓ CHỮ.
 *  - nhóm "Trên website" với 3 ô tên thường ngày; nhóm "Trên ứng dụng nhắn tin"; nhóm "Sao chép & bán".
 *  - S-24: link công khai và iFrame cùng dùng origin hiện tại + widget_key (không ghi cứng founderai.biz, không id số).
 *  - S-13: "Chia sẻ thành viên" → "Gửi bản sao"; Marketplace đã đăng thì hiện "Đã đăng bán" và không bấm được.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DeployTab from '../DeployTab';
import RightPanel from '../RightPanel';
import { useAuthStore } from '../../../stores/authStore';

vi.mock('../../../features/chatbot/services/chatbotApi.service', () => ({
  default: { listChatbots: vi.fn() },
}));
vi.mock('../../../hooks/queries/useChannelEntitlements', () => ({
  useChannelEntitlements: () => ({ telegram: true, whatsapp: true, zalo: true, limits: {}, isLoading: false }),
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../ChannelModals', () => ({ ChannelModal: () => null }));
vi.mock('../../../components/marketplace/ShareChatbotModal', () => ({ default: () => null }));
vi.mock('../../../components/marketplace/MarketplaceListingModal', () => ({ default: () => null }));
vi.mock('../../../i18n', async () => (await import('./studioTestI18n.js')).i18nMock);

const bot = { id: 9, name: 'Bot', widget_key: 'wk9' };

describe('DeployTab — bố cục gọn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: { id: 1 }, activeContext: { type: 'self' } });
  });

  it('một tiêu đề "Đưa chatbot tới khách"; không còn chữ "Triển khai" trong cột (không thanh tab một nút)', () => {
    const { container } = render(<RightPanel chatbot={bot} onOpenWidgetSettings={() => {}} />);

    expect(screen.getAllByText('Đưa chatbot tới khách')).toHaveLength(1);
    expect(screen.queryByText('Triển khai')).toBeNull();
    expect(container.querySelector('[class*="bg-slate-100/80"]')).toBeNull();
  });

  it('không còn biểu tượng bảng màu không nhãn ở tiêu đề; có dòng chữ "Đổi màu, vị trí, lời mời mở chat" mở Giao diện widget', () => {
    const onOpenWidgetSettings = vi.fn();
    render(<DeployTab chatbot={bot} onOpenWidgetSettings={onOpenWidgetSettings} />);

    expect(screen.queryByTitle('Tuỳ chỉnh giao diện widget')).toBeNull();
    fireEvent.click(screen.getByText('Đổi màu, vị trí, lời mời mở chat'));
    expect(onOpenWidgetSettings).toHaveBeenCalledTimes(1);
  });

  it('ba nhóm có tên mới và ba ô nhúng có tên thường ngày', () => {
    render(<DeployTab chatbot={bot} onOpenWidgetSettings={() => {}} />);

    for (const label of ['Trên website', 'Trên ứng dụng nhắn tin', 'Sao chép & bán']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    for (const label of ['Nút chat nổi', 'Khung chat trong trang', 'Link chat riêng']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    for (const gone of ['Chat Widget', 'iFrame', 'Public Link', 'Nhúng lên website', 'Kênh hội thoại', 'Chia sẻ thành viên', 'Đăng Marketplace']) {
      expect(screen.queryByText(gone)).toBeNull();
    }
  });

  it('S-24: link chat riêng và mã iFrame dùng origin hiện tại + widget_key (không founderai.biz cứng, không id số)', () => {
    const origin = window.location.origin;
    const { container, unmount } = render(<DeployTab chatbot={bot} onOpenWidgetSettings={() => {}} />);

    fireEvent.click(screen.getByText('Link chat riêng'));
    expect(screen.getByDisplayValue(`${origin}/chat/wk9`)).toBeTruthy();
    expect(screen.queryByDisplayValue(/founderai\.biz/)).toBeNull();
    unmount();

    const second = render(<DeployTab chatbot={bot} onOpenWidgetSettings={() => {}} />);
    fireEvent.click(screen.getByText('Khung chat trong trang'));
    const code = second.container.ownerDocument.querySelector('pre').textContent;
    expect(code).toContain(`src="${origin}/chat/wk9"`);
    expect(code).not.toContain('/chat/9"');
    expect(container).toBeTruthy();
  });

  it('S-13: "Gửi bản sao" mô tả đúng việc (bản sao trong tài khoản khác)', () => {
    render(<DeployTab chatbot={bot} onOpenWidgetSettings={() => {}} />);
    const tile = screen.getByText('Gửi bản sao').closest('button');
    expect(tile.getAttribute('title')).toBe('Tạo bản sao chatbot trong tài khoản Founder AI khác');
  });

  it('Marketplace: chưa đăng → "Đăng bán trên Marketplace" bấm được; đã đăng (published) → "Đã đăng bán" và khoá', () => {
    const { unmount } = render(<DeployTab chatbot={bot} onOpenWidgetSettings={() => {}} />);
    expect(screen.getByText('Đăng bán trên Marketplace').closest('button')).not.toBeDisabled();
    unmount();

    render(<DeployTab chatbot={{ ...bot, marketplace_listing_status: 'published' }} onOpenWidgetSettings={() => {}} />);
    expect(screen.queryByText('Đăng bán trên Marketplace')).toBeNull();
    expect(screen.getByText('Đã đăng bán').closest('button')).toBeDisabled();
  });

  it('Marketplace: listing đang tạm dừng/nháp → "Đã có bài đăng" (cũng khoá, khỏi bấm rồi nhận lỗi trùng)', () => {
    render(<DeployTab chatbot={{ ...bot, marketplace_listing_status: 'paused' }} onOpenWidgetSettings={() => {}} />);
    expect(screen.getByText('Đã có bài đăng').closest('button')).toBeDisabled();
  });
});
