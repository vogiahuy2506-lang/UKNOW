/**
 * Ảnh minh hoạ cho bài "Nhân viên & phân quyền" (/huong-dan/nhan-vien).
 *
 * Cần `E2E_SEED_EMPLOYEES=1` (đã nằm trong `E2E_SEED_ALL=1`) để có nhân viên
 * trong danh sách; trang rỗng thì ba trong bốn ảnh vô nghĩa.
 */
import {
  sidebarShot, regionShot, highlight, hideVolatileChrome, settle, contentShot,
} from '../lib/shotHelpers.js';

export default {
  slug: 'nhan-vien',
  shots: [
    {
      name: 'menu-nhan-vien',
      caption: 'menu bên trái đang mở nhóm Cài đặt, khoanh đỏ mục "Nhân viên"',
      async take(page, { baseURL }) {
        return sidebarShot(page, { groupName: 'Cài đặt', itemName: 'Nhân viên', baseURL });
      },
    },
    {
      name: 'danh-sach-nhan-vien',
      caption: 'trang Nhân viên, danh sách người đã thêm',
      async take(page) {
        return regionShot(page, {
          path: '/app/settings/employees',
          clip: 'main table',
          waitFor: 'main table tbody tr',
        });
      },
    },
    {
      name: 'hop-thoai-them-nhan-vien',
      caption: 'hộp thoại thêm nhân viên, khoanh đỏ ô nhập email',
      localOnly: true,
      async take(page) {
        await page.goto('/app/settings/employees');
        await page.getByRole('button', { name: 'Thêm nhân viên' }).first().waitFor({ timeout: 30_000 });
        await settle(page);
        await page.getByRole('button', { name: 'Thêm nhân viên' }).first().click();

        // Hộp thoại là lớp phủ toàn màn hình; lấy khung trắng bên trong để chụp.
        const dialog = page.locator('div.fixed.inset-0').filter({ hasText: 'nhân viên' }).last();
        await dialog.waitFor({ state: 'visible', timeout: 15_000 });
        await hideVolatileChrome(page);
        await highlight(dialog.locator('input[type="email"], input[name*="email" i]').first());
        await page.waitForTimeout(200);
        return dialog.locator('div').filter({ has: page.locator('input') }).first();
      },
    },
    {
      name: 'bang-cap-quyen',
      caption: 'bảng cấp quyền của một nhân viên',
      localOnly: true,
      async take(page) {
        await page.goto('/app/settings/employees');
        const firstRow = page.locator('main table tbody tr').first();
        await firstRow.waitFor({ state: 'visible', timeout: 30_000 });
        await settle(page);
        await firstRow.click();

        // Bấm dòng nhân viên mở một hộp thoại có ba tab: Thông tin / Phân quyền /
        // Giới hạn. Mặc định vào tab Thông tin, phải chuyển sang Phân quyền.
        const dialog = page.locator('div.fixed.inset-0').last();
        await dialog.waitFor({ state: 'visible', timeout: 15_000 });
        await dialog.getByRole('button', { name: 'Phân quyền' }).first().click();
        await page.waitForTimeout(800);
        await hideVolatileChrome(page);

        // Ba dòng quyền chiến dịch tách riêng — đúng thứ chú thích muốn chỉ ra.
        let marked = 0;
        for (const label of [/^Chiến dịch — xem$/, /^Chiến dịch — tạo$/, /^Chiến dịch — chạy$/]) {
          const row = dialog.getByText(label).first();
          if (await row.isVisible().catch(() => false)) { await highlight(row); marked += 1; }
        }
        if (!marked) throw new Error('Không thấy dòng quyền chiến dịch nào trong tab Phân quyền');
        await page.waitForTimeout(200);
        // Khung trắng của hộp thoại, không phải lớp phủ đen phủ kín màn hình.
        return contentShot(page, dialog.locator('> div').last());
      },
    },
  ],
};
