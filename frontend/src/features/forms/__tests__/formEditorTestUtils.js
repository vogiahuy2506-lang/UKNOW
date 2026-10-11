import { screen, fireEvent, within } from '@testing-library/react';

/**
 * Trợ giúp chung cho các spec của trình soạn biểu mẫu (FormEditorPage) sau khi bố cục đổi (PR-3, 11/10/2026):
 * mọi cấu hình ngoài việc soạn trường (thông tin chung, sau khi gửi, đặt lịch, thanh toán, giao diện, sản phẩm) nằm trong
 * modal "Cài đặt" có tab thay cho các khối xếp dọc trong trang. File này CHỈ chứa cách TÌM và BẤM phần tử — không có kỳ vọng.
 */

export const SETTINGS_TAB_NAMES = {
  general: 'Thông tin chung',
  afterSubmit: 'Sau khi gửi',
  booking: 'Đặt lịch hẹn',
  payment: 'Thanh toán',
  theme: 'Giao diện',
  product: 'Sản phẩm',
};

/** Mở modal Cài đặt (nếu chưa mở) rồi chọn tab. */
export function openSettingsTab(tab) {
  if (!screen.queryByRole('dialog')) {
    fireEvent.click(screen.getByRole('button', { name: 'Cài đặt' }));
  }
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: SETTINGS_TAB_NAMES[tab] }));
}

/** Hàng thứ `idx` (0-based) trong danh sách trường bên trái. */
export const fieldRow = (idx) => screen.getByTestId(`field-row-${idx}`);

/** Bấm chọn hàng thứ `idx` để mở bảng thuộc tính của trường đó. */
export function selectFieldRow(idx) {
  fireEvent.click(within(fieldRow(idx)).getByRole('button', { name: new RegExp(`^Trường #${idx + 1}:`) }));
}
