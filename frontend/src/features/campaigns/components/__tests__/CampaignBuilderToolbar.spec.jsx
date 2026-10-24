import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../../i18n';
import CampaignBuilderToolbar from '../CampaignBuilderToolbar';

/**
 * PLAN_NUT_HANH_DONG_TRONG_SO_DO_CHIEN_DICH_2026-09-16.md — PR-1, cập nhật theo PLAN_THANH_NUT_VA_LOG_2026-10-17.
 *
 * Spec của CampaignBuilder mock cả layout, nên KHÔNG canh được nút nào nối vào hàm nào. Đây đúng là
 * chỗ sai thì đắt nhất: "Chạy thử" chỉ chạy trong trình duyệt để xem trước, "Chạy ngay" gửi thật cho
 * khách. Nối nhầm hai cái này là tin đã gửi đi rồi mới biết, test kia vẫn xanh.
 *
 * Thanh trên giờ chỉ còn: Lưu · Lên lịch · Chạy ngay · ⋯ (Chia sẻ, Nhân bản). Chạy thử / Dừng đã bỏ 23/10/2026 (chỉ còn một lối gửi).
 */
function renderToolbar(overrides = {}) {
  const props = {
    onRunNow: vi.fn(),
    onOpenSchedule: vi.fn(),
    canUseServerRunActions: true,
    serverRunActionsDisabledHint: 'Lưu chiến dịch trước đã',
    onOpenNameModal: vi.fn(),
    isDirty: false,
    onOpenShare: vi.fn(),
    canShare: true,
    onOpenDuplicate: vi.fn(),
    ...overrides,
  };
  render(
    <I18nProvider>
      <CampaignBuilderToolbar {...props} />
    </I18nProvider>
  );
  return props;
}

const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Thêm hành động' }));

describe('CampaignBuilderToolbar', () => {
  it('thanh trên chỉ có Lưu, Lên lịch, Chạy ngay và nút ⋯; Chạy thử / Dừng / Chia sẻ / Nhân bản KHÔNG nằm ngoài', () => {
    renderToolbar();
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lên lịch' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chạy ngay' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thêm hành động' })).toBeInTheDocument();
    for (const name of ['Chạy thử', 'Dừng', 'Chia sẻ', 'Nhân bản', 'Chạy']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('mỗi nút gọi ĐÚNG hàm của nó — không nút nào nối chéo', () => {
    const props = renderToolbar();

    fireEvent.click(screen.getByRole('button', { name: 'Chạy ngay' }));
    expect(props.onRunNow).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Lên lịch' }));
    expect(props.onOpenSchedule).toHaveBeenCalledTimes(1);
    expect(props.onRunNow).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(props.onOpenNameModal).toHaveBeenCalledTimes(1);

    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Chia sẻ' }));
    expect(props.onOpenShare).toHaveBeenCalledTimes(1);
    expect(props.onOpenDuplicate).not.toHaveBeenCalled();
    // Chọn xong thì menu đóng.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Nhân bản' }));
    expect(props.onOpenDuplicate).toHaveBeenCalledTimes(1);
    expect(props.onOpenShare).toHaveBeenCalledTimes(1);
  });

  describe('Lưu đổi kiểu theo isDirty', () => {
    it('có thay đổi chưa lưu → nút chính màu cam (primary)', () => {
      renderToolbar({ isDirty: true });
      const save = screen.getByRole('button', { name: 'Lưu' });
      expect(save).toHaveAttribute('data-emphasis', 'primary');
      expect(save.className).toContain('bg-primary-500');
    });

    it('đã lưu → kiểu phụ nhạt, KHÔNG cam, nhưng vẫn bấm được', () => {
      const props = renderToolbar({ isDirty: false });
      const save = screen.getByRole('button', { name: 'Lưu' });
      expect(save).toHaveAttribute('data-emphasis', 'secondary');
      expect(save.className).not.toContain('bg-primary-500');
      expect(save).toBeEnabled();
      fireEvent.click(save);
      expect(props.onOpenNameModal).toHaveBeenCalledTimes(1);
    });
  });

  describe('menu ⋯', () => {
    it('có aria-label, aria-haspopup, aria-expanded đổi theo trạng thái mở', () => {
      renderToolbar();
      const trigger = screen.getByRole('button', { name: 'Thêm hành động' });
      expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('menu', { name: 'Thêm hành động' })).toBeInTheDocument();
    });

    it('bấm lại nút ⋯ thì đóng', () => {
      renderToolbar();
      openMenu();
      openMenu();
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('Esc đóng menu và trả tiêu điểm về nút ⋯', () => {
      renderToolbar();
      openMenu();
      const item = screen.getByRole('menuitem', { name: 'Chia sẻ' });
      expect(item).toHaveFocus();
      fireEvent.keyDown(item, { key: 'Escape' });
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Thêm hành động' })).toHaveFocus();
    });

    it('bấm ra ngoài thì đóng', () => {
      renderToolbar();
      openMenu();
      fireEvent.mouseDown(document.body);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('bấm TRONG menu (không phải mục) không đóng; mũi tên đi giữa các mục', () => {
      renderToolbar();
      openMenu();
      const share = screen.getByRole('menuitem', { name: 'Chia sẻ' });
      const duplicate = screen.getByRole('menuitem', { name: 'Nhân bản' });
      fireEvent.mouseDown(screen.getByRole('menu'));
      expect(screen.getByRole('menu')).toBeInTheDocument();
      expect(share).toHaveFocus();
      fireEvent.keyDown(share, { key: 'ArrowDown' });
      expect(duplicate).toHaveFocus();
      fireEvent.keyDown(duplicate, { key: 'ArrowDown' });
      expect(share).toHaveFocus();
      fireEvent.keyDown(share, { key: 'ArrowUp' });
      expect(duplicate).toHaveFocus();
    });
  });

  // PLAN_NUT_HANH_DONG_TRONG_SO_DO_CHIEN_DICH_2026-09-16.md — PR-2: API chi tiết chiến dịch trả origin; mục "Chia sẻ" KHÔNG
  // được mặc định hiện khi thiếu dữ liệu — chiến dịch mua Marketplace/được chia sẻ mà vẫn chia sẻ tiếp là lỗi quyền.
  it('canShare=false (chiến dịch không tự tạo) → mục Chia sẻ KHÔNG có trong menu; Nhân bản vẫn còn', () => {
    renderToolbar({ canShare: false });
    openMenu();
    expect(screen.queryByRole('menuitem', { name: 'Chia sẻ' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Nhân bản' })).toBeInTheDocument();
  });

  it('chiến dịch chưa lưu lần nào → Chia sẻ/Nhân bản trong menu cũng vô hiệu kèm tooltip như 2 nút gửi thật', () => {
    const props = renderToolbar({ canUseServerRunActions: false });
    openMenu();

    const share = screen.getByRole('menuitem', { name: 'Chia sẻ' });
    const duplicate = screen.getByRole('menuitem', { name: 'Nhân bản' });
    expect(share).toBeDisabled();
    expect(duplicate).toBeDisabled();
    expect(share).toHaveAttribute('title', 'Lưu chiến dịch trước đã');
    expect(duplicate).toHaveAttribute('title', 'Lưu chiến dịch trước đã');

    fireEvent.click(share);
    fireEvent.click(duplicate);
    expect(props.onOpenShare).not.toHaveBeenCalled();
    expect(props.onOpenDuplicate).not.toHaveBeenCalled();
  });

  it('chiến dịch chưa lưu lần nào → 2 nút gửi thật vô hiệu kèm tooltip; Lưu vẫn bấm được', () => {
    const props = renderToolbar({ canUseServerRunActions: false, isDirty: true });

    const runNow = screen.getByRole('button', { name: 'Chạy ngay' });
    const schedule = screen.getByRole('button', { name: 'Lên lịch' });
    expect(runNow).toBeDisabled();
    expect(schedule).toBeDisabled();
    expect(runNow).toHaveAttribute('title', 'Lưu chiến dịch trước đã');
    expect(schedule).toHaveAttribute('title', 'Lưu chiến dịch trước đã');

    fireEvent.click(runNow);
    expect(props.onRunNow).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeEnabled();
  });
});
