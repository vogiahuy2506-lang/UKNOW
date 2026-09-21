/**
 * Ảnh minh hoạ cho bài "Nhân viên & phân quyền" (/huong-dan/nhan-vien).
 *
 * Cần `E2E_SEED_EMPLOYEES=1` (đã nằm trong `E2E_SEED_ALL=1`) để có nhân viên
 * trong danh sách; trang rỗng thì ba trong bốn ảnh vô nghĩa.
 */
import {
  sidebarShot, regionShot, highlight, hideVolatileChrome, settle, contentShot, paddedShot,
} from '../lib/shotHelpers.js';
import { ensureLinkedEmployeeDemo, loginAs, LINKED_EMPLOYEE } from '../lib/shotFixtures.js';

/**
 * Đăng nhập nhân viên CÓ GÓI RIÊNG (đã được chủ link + cấp bộ quyền "Chỉ xem") trong một context
 * riêng. Người này vào tài khoản của chính họ trước, nên mới có dải mời để chụp.
 */
async function loginLinkedEmployee(page, baseURL) {
  await ensureLinkedEmployeeDemo();
  const other = await loginAs(page, { username: LINKED_EMPLOYEE.username, baseURL });
  await other.locator('aside').first().waitFor({ state: 'visible', timeout: 30_000 });
  await settle(other);
  return other;
}

/** Chụp xong thì đóng context phụ. */
function shotThenClose(other, shot) {
  return {
    screenshot: async (options = {}) => {
      try {
        return await shot.screenshot(options);
      } finally {
        await other.context().close();
      }
    },
  };
}

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
        // Từ khi có thêm cột "Quyền", bảng rộng hơn khung 1440px và cột cuối bị cắt ngang chữ.
        // Nới khung cho bảng hiện trọn, chụp xong trả lại.
        const viewport = page.viewportSize();
        await page.setViewportSize({ width: 1760, height: viewport.height });
        try {
          const shot = await regionShot(page, {
            path: '/app/settings/employees',
            clip: 'main table',
            waitFor: 'main table tbody tr',
          });
          return {
            screenshot: async (options = {}) => {
              try {
                return await shot.screenshot(options);
              } finally {
                await page.setViewportSize(viewport);
              }
            },
          };
        } catch (error) {
          await page.setViewportSize(viewport);
          throw error;
        }
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
    {
      name: 'hai-tab-them-nhan-vien',
      caption: 'hộp thoại Thêm nhân viên, khoanh đỏ hai tab "Tạo tài khoản mới" và "Link tài khoản có sẵn"',
      localOnly: true,
      async take(page) {
        await page.goto('/app/settings/employees');
        await page.getByRole('button', { name: 'Thêm nhân viên' }).first().waitFor({ timeout: 30_000 });
        await settle(page);
        await page.getByRole('button', { name: 'Thêm nhân viên' }).first().click();
        const dialog = page.locator('div.fixed.inset-0').filter({ hasText: 'nhân viên' }).last();
        await dialog.waitFor({ state: 'visible', timeout: 15_000 });
        await hideVolatileChrome(page);
        // Hàng tab: nút đầu tiên mang đúng tên từng tab (nút gửi ở cuối hộp trùng tên nên lấy .first()).
        await highlight(dialog.getByRole('button', { name: 'Tạo tài khoản mới', exact: true }).first());
        await highlight(dialog.getByRole('button', { name: 'Link tài khoản có sẵn', exact: true }).first());
        await page.waitForTimeout(200);
        return dialog.locator('div').filter({ has: page.locator('input') }).first();
      },
    },
    {
      name: 'dai-moi-vao-khong-gian-cong-ty',
      caption: 'dải thông báo trên đầu trang của nhân viên, khoanh đỏ nút Vào không gian của công ty',
      localOnly: true,
      async take(page, { baseURL }) {
        const other = await loginLinkedEmployee(page, baseURL);
        const enter = other.getByRole('button', { name: /^Vào không gian của/ }).first();
        await enter.waitFor({ state: 'visible', timeout: 30_000 });
        await hideVolatileChrome(other);
        await highlight(enter);
        await other.waitForTimeout(200);
        // Dải nằm ngay dưới thanh ngang: chụp cả dải đầu trang để thấy nó nằm ở đâu.
        const box = await enter.boundingBox();
        const clip = { x: 0, y: 0, width: other.viewportSize().width, height: Math.ceil(box.y + box.height + 60) };
        return shotThenClose(other, { screenshot: (options = {}) => other.screenshot({ ...options, clip }) });
      },
    },
    {
      name: 'menu-anh-dai-dien-khong-gian-lam-viec',
      caption: 'menu ảnh đại diện góc trên bên phải của nhân viên, khoanh đỏ mục Không gian làm việc và dòng Nhân viên của công ty',
      localOnly: true,
      async take(page, { baseURL }) {
        const other = await loginLinkedEmployee(page, baseURL);
        await hideVolatileChrome(other);
        await other.locator('header button').filter({ hasText: LINKED_EMPLOYEE.fullName }).first().click();
        const heading = other.getByText('Không gian làm việc', { exact: true }).first();
        await heading.waitFor({ state: 'visible', timeout: 15_000 });
        const companyRow = other.getByRole('button', { name: /^Nhân viên của/ }).first();
        await companyRow.waitFor({ state: 'visible', timeout: 15_000 });
        await highlight(heading);
        await highlight(companyRow);
        await other.waitForTimeout(200);
        const menu = heading.locator('xpath=ancestor::div[contains(@class,"shadow")][1]');
        return shotThenClose(other, await paddedShot(other, menu, { pad: 18 }));
      },
    },
    {
      name: 'menu-nhan-vien-co-quyen-xem-chien-dich',
      caption: 'menu bên trái của nhân viên sau khi được cấp quyền Chiến dịch — xem, đã hiện mục Quản lý chiến dịch',
      localOnly: true,
      async take(page, { baseURL }) {
        const other = await loginLinkedEmployee(page, baseURL);
        await other.getByRole('button', { name: /^Vào không gian của/ }).first().click();
        const sidebar = other.locator('aside').first();
        const group = sidebar.getByRole('button', { name: /Chiến dịch/i }).first();
        await group.waitFor({ state: 'visible', timeout: 30_000 });
        const item = sidebar.getByRole('link', { name: 'Quản lý chiến dịch', exact: true });
        if (!(await item.isVisible().catch(() => false))) await group.click();
        await item.waitFor({ state: 'visible', timeout: 15_000 });
        await settle(other);
        await hideVolatileChrome(other);
        await highlight(item);
        await other.waitForTimeout(200);
        const list = sidebar.locator('nav').first();
        return shotThenClose(other, await contentShot(other, (await list.count()) ? list : sidebar));
      },
    },
  ],
};
