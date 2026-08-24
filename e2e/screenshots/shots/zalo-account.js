/**
 * Hai ô còn thiếu của bài "Thêm tài khoản Zalo" (/huong-dan/zalo-account).
 *
 * Cần `E2E_SEED_CHANNELS=1` (nằm trong `E2E_SEED_ALL=1`): hai tài khoản Zalo,
 * một cái mặc định và một cái `needs_reauth`. Nút "Đặt mặc định" chỉ hiện trên
 * tài khoản KHÔNG phải mặc định, nên một tài khoản là không chụp được ô đó.
 */
import {
  highlight, hideVolatileChrome, settle, contentShot, enclosingSection,
} from '../lib/shotHelpers.js';

const CHANNELS_PATH = '/app/settings/channels';

/** Mở trang kênh gửi rồi chuyển sang thẻ Zalo. */
async function openZaloTab(page) {
  await page.goto(CHANNELS_PATH);
  const tab = page.getByRole('button', { name: 'Zalo', exact: true }).first();
  await tab.waitFor({ state: 'visible', timeout: 30_000 });
  await tab.click();
  await page.getByText('Cần kết nối lại', { exact: true })
    .first().waitFor({ state: 'visible', timeout: 20_000 })
    .catch(() => {});
  await settle(page);
  await hideVolatileChrome(page);
}

export default {
  slug: 'zalo-account',
  shots: [
    {
      name: 'can-ket-noi-lai',
      caption: 'một tài khoản Zalo đang ở trạng thái "Cần kết nối lại", khoanh đỏ nút "Kết nối lại" bên cạnh',
      localOnly: true,
      async take(page) {
        await openZaloTab(page);

        const badge = page.getByText('Cần kết nối lại', { exact: true }).first();
        if (!(await badge.isVisible().catch(() => false))) {
          throw new Error(
            'Không tài khoản Zalo nào ở trạng thái "Cần kết nối lại". Nạp lại DB:\n'
            + '  E2E_SEED_DEMO=1 E2E_SEED_CHANNELS=1 node scripts/seed-test-db.js',
          );
        }

        // Bám nút "Kết nối lại" NẰM TRONG thẻ của đúng tài khoản đó — tài khoản
        // kia cũng có nút cùng tên, lấy nhầm là khoanh sai chỗ.
        const card = await enclosingSection(page, badge);
        const reconnect = card.getByRole('button', { name: 'Kết nối lại', exact: true }).first();
        if (!(await reconnect.isVisible().catch(() => false))) {
          throw new Error('Thấy nhãn "Cần kết nối lại" nhưng không thấy nút "Kết nối lại" trong cùng thẻ');
        }
        await highlight(badge);
        await highlight(reconnect);
        await page.waitForTimeout(200);
        return contentShot(page, card);
      },
    },
    {
      name: 'dat-mac-dinh',
      caption: 'danh sách 2 tài khoản Zalo, khoanh đỏ nút "Đặt mặc định"',
      localOnly: true,
      async take(page) {
        await openZaloTab(page);

        const setDefault = page.getByRole('button', { name: 'Đặt mặc định', exact: true }).first();
        if (!(await setDefault.isVisible({ timeout: 15_000 }).catch(() => false))) {
          throw new Error(
            'Không thấy nút "Đặt mặc định" — nút này chỉ hiện khi có từ hai tài khoản Zalo\n'
            + 'và tài khoản đó chưa phải mặc định. Nạp lại DB:\n'
            + '  E2E_SEED_DEMO=1 E2E_SEED_CHANNELS=1 node scripts/seed-test-db.js',
          );
        }
        // CHỈ khoanh, KHÔNG bấm: bấm là đổi tài khoản mặc định thật.
        await highlight(setDefault);
        await page.waitForTimeout(200);
        return contentShot(page, page.locator('main').first());
      },
    },
  ],
};
