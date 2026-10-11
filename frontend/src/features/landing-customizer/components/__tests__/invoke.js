import { fireEvent, screen } from '@testing-library/react';

/**
 * Bấm một hành động của trình soạn Tuỳ chỉnh Landing dù nó nằm ở đâu: nút lộ sẵn trên thanh trên, mục trong menu
 * "Công cụ" hoặc nút trong modal "Cài đặt". Test hợp đồng dữ liệu (chọn → gõ → Lưu) dùng cách này để cùng một ca chạy
 * được trên bố cục cũ (nút rải ở đầu trang) và bố cục mới (Cài đặt/Công cụ) — hành vi cần chứng minh KHÔNG đổi, chỉ nơi
 * đặt nút đổi.
 */
export function invoke(name) {
  const direct = screen.queryAllByRole('button', { name }).filter((b) => !b.disabled);
  if (direct.length) {
    fireEvent.click(direct[0]);
    return 'direct';
  }
  const tools = screen.queryByRole('button', { name: /Công cụ/ });
  if (tools) {
    fireEvent.click(tools);
    const item = screen.queryAllByRole('menuitem', { name })[0];
    if (item) {
      fireEvent.click(item);
      return 'tools';
    }
    fireEvent.click(tools); // đóng menu, thử chỗ khác
  }
  const settings = screen.queryByRole('button', { name: /Cài đặt/ });
  if (settings) {
    fireEvent.click(settings);
    const dialog = screen.queryByRole('dialog');
    if (dialog) {
      const inside = Array.from(dialog.querySelectorAll('button')).find((b) => {
        const label = (b.getAttribute('aria-label') || b.textContent || '').trim();
        return typeof name === 'string' ? label === name : name.test(label);
      });
      if (inside) {
        fireEvent.click(inside);
        return 'settings';
      }
    }
  }
  throw new Error(`Không tìm thấy hành động ${String(name)} ở nút trực tiếp, menu Công cụ hay modal Cài đặt`);
}

/**
 * Chọn một "tab" chọn nhanh (trang Hero/Liên hệ/Bảng giá, tab ngôn ngữ VI/EN): bố cục cũ là `button`, bố cục mới dùng
 * `TopbarSegmented` (role="tab"). Cụm chọn trang có thể xuất hiện hai lần (thanh trên + dải dành cho màn hẹp) — bấm cái đầu.
 */
export function pickTab(name) {
  const el = [...screen.queryAllByRole('tab', { name }), ...screen.queryAllByRole('button', { name })][0];
  if (!el) throw new Error(`Không tìm thấy tab/nút ${String(name)}`);
  fireEvent.click(el);
}
