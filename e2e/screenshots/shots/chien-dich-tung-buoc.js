/**
 * Ảnh minh hoạ cho bài "Tạo chiến dịch từng bước" (/huong-dan/chien-dich-tung-buoc).
 *
 * Trang tạo chiến dịch từng bước (/app/campaigns/simple) giữ trạng thái trong bộ nhớ, không lưu vào storage, nên mỗi ảnh
 * mở trang mới rồi bấm lại từ đầu tới bước cần chụp (`walkTo`). Ảnh nào cũng DỪNG TRƯỚC nút "Bắt đầu gửi": kịch bản không
 * bao giờ bấm gửi/đặt lịch nên không tạo chiến dịch, không gửi tin. Vì vậy các ảnh màn kết quả (Đang gửi chiến dịch / Đã hẹn
 * gửi / chờ duyệt) KHÔNG có ô [ẢNH] trong bài.
 *
 * Cần `E2E_SEED_ALL=1`: tài khoản email gửi `cskh@uknow.vn`. Dữ liệu seed không có biểu mẫu nên ảnh chỉ dùng nguồn
 * "Tự nhập danh sách". Thẻ "Tự động gửi cho người mới" chỉ hiện với nguồn landing / biểu mẫu / Google Sheet nên không có
 * trong ảnh bước Thời gian (nguồn tự nhập); bài chỉ tả nó bằng chữ.
 *
 * Mọi ảnh trong bước chạy ở máy mình (localOnly): cần tài khoản email đã seed. Thao tác chỉ là điều hướng + gõ vào ô,
 * nhưng giữ localOnly cho khỏi phụ thuộc dữ liệu thật.
 */
import { highlight, hideVolatileChrome, settle, contentShot } from '../lib/shotHelpers.js';

/** Khối bước + thanh nút Quay lại / Tiếp tục: cha trực tiếp của vùng thân bước. */
function stepCard(page, stepId) {
  return page.getByTestId(`simple-step-body-${stepId}`).locator('xpath=..');
}

async function next(page, toStep) {
  const button = page.getByTestId('simple-next');
  await button.waitFor({ state: 'visible', timeout: 15_000 });
  // Nút mờ (disabled) tới khi chọn đủ; chờ nó bật rồi mới bấm.
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="simple-next"]');
    return el && !el.disabled;
  }, null, { timeout: 15_000 });
  await button.click();
  await page.getByTestId(`simple-step-body-${toStep}`).waitFor({ state: 'visible', timeout: 15_000 });
}

/**
 * Mở trang mới và đi tới bước `target`, điền tối thiểu để qua từng bước (email → tự nhập 2 email → tự soạn → Gửi ngay).
 * Trả về khi bước `target` đã hiện.
 */
async function walkTo(page, target) {
  await page.goto('/app/campaigns/simple');
  await page.getByTestId('simple-step-body-channel').waitFor({ state: 'visible', timeout: 30_000 });
  await settle(page);
  await hideVolatileChrome(page);
  if (target === 'channel') return;

  await page.getByTestId('simple-channel-email').click();
  await page.getByTestId('simple-sender-section').waitFor({ state: 'visible', timeout: 15_000 });
  // Chỉ một tài khoản dùng được thì được chọn sẵn; nhiều tài khoản thì chọn cái đầu tiên chưa chọn.
  const firstSender = page.locator('[data-testid^="simple-sender-"]:not([data-testid="simple-sender-section"]):not([data-testid="simple-sender-empty"])').first();
  await firstSender.waitFor({ state: 'visible', timeout: 15_000 });
  const enabled = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="simple-next"]');
    return !!el && !el.disabled;
  });
  if (!enabled) await firstSender.click();
  if (target === 'channel-ready') return;

  await next(page, 'audience');
  await settle(page);
  if (target === 'audience') return;

  await page.getByTestId('simple-audience-manual').click();
  await page.locator('#simple-manual-list').fill('an@example.com\nbinh@example.com');
  await page.getByTestId('simple-manual-count').waitFor({ state: 'visible', timeout: 15_000 });
  if (target === 'audience-manual') return;

  await next(page, 'content');
  await page.getByTestId('simple-content-custom').click();
  await page.locator('#simple-content-subject').fill('Ưu đãi tháng 10 dành cho bạn');
  await page.locator('#simple-content-body').fill('Chào bạn, tháng này shop có ưu đãi dành riêng cho khách quen. Bạn xem chi tiết nhé!');
  if (target === 'content') return;

  await next(page, 'when');
  await settle(page);
  if (target === 'when') return;

  await page.getByTestId('simple-when-recurring').click();
  await page.getByTestId('simple-when-recurring-panel').waitFor({ state: 'visible', timeout: 15_000 });
  if (target === 'when-recurring') return;

  // Quay lại "Gửi ngay" để nút cuối là "Bắt đầu gửi" (không phải "Đặt lịch") rồi sang bước Xem lại.
  await page.getByTestId('simple-when-now').click();
  await next(page, 'review');
  await page.getByTestId('simple-summary').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('simple-preview-loading').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});
}

async function finish(page, stepId, { maxHeight = 0 } = {}) {
  await settle(page);
  await hideVolatileChrome(page);
  await page.waitForTimeout(200);
  return contentShot(page, stepCard(page, stepId), { pad: 20, maxHeight });
}

export default {
  slug: 'chien-dich-tung-buoc',
  shots: [
    {
      name: 'hop-chon-cach-tao',
      caption: 'hộp chọn cách tạo chiến dịch, khoanh đỏ thẻ "Từng bước" và thẻ "Sơ đồ khối" bên cạnh',
      localOnly: true,
      async take(page) {
        await page.goto('/app/campaigns');
        await settle(page);
        await page.getByRole('button', { name: 'Tạo', exact: true }).click();
        const modal = page.getByTestId('create-method-modal');
        await modal.waitFor({ state: 'visible', timeout: 15_000 });
        await hideVolatileChrome(page);
        await highlight(page.getByTestId('create-method-step'));
        await highlight(page.getByTestId('create-method-blocks'));
        await page.waitForTimeout(200);
        return contentShot(page, page.getByRole('dialog').first(), { pad: 20 });
      },
    },
    {
      name: 'buoc-kenh-gui',
      caption: 'bước Kênh gửi, khoanh đỏ thẻ "Email" đang được chọn và danh sách tài khoản gửi bên dưới',
      localOnly: true,
      async take(page) {
        await walkTo(page, 'channel-ready');
        await highlight(page.getByTestId('simple-channel-email'));
        await highlight(page.getByTestId('simple-sender-section'));
        return finish(page, 'channel');
      },
    },
    {
      name: 'buoc-nguoi-nhan',
      caption: 'bước Người nhận, khoanh đỏ danh sách các nguồn người nhận để chọn',
      localOnly: true,
      async take(page) {
        await walkTo(page, 'audience');
        for (const type of ['customers', 'landing', 'form', 'sheet', 'manual']) {
          const card = page.getByTestId(`simple-audience-${type}`);
          if (await card.isVisible().catch(() => false)) await highlight(card);
        }
        return finish(page, 'audience');
      },
    },
    {
      name: 'nhap-danh-sach',
      caption: 'ô nhập danh sách ở nguồn "Tự nhập danh sách", đã dán hai email, khoanh đỏ dòng báo số người đã nhận',
      localOnly: true,
      async take(page) {
        await walkTo(page, 'audience-manual');
        await highlight(page.getByTestId('simple-manual-count'));
        return finish(page, 'audience');
      },
    },
    {
      name: 'buoc-noi-dung',
      caption: 'bước Nội dung, khoanh đỏ thẻ "Tự soạn" cùng ô "Tiêu đề thư" và ô "Nội dung" đã điền',
      localOnly: true,
      async take(page) {
        await walkTo(page, 'content');
        await highlight(page.getByTestId('simple-content-custom'));
        await highlight(page.locator('#simple-content-subject'));
        await highlight(page.locator('#simple-content-body'));
        return finish(page, 'content');
      },
    },
    {
      name: 'buoc-thoi-gian',
      caption: 'bước Thời gian, khoanh đỏ các thẻ cách gửi, thẻ "Gửi ngay" đang được chọn',
      localOnly: true,
      async take(page) {
        await walkTo(page, 'when');
        for (const id of ['now', 'scheduled', 'continuous', 'recurring']) {
          const card = page.getByTestId(`simple-when-${id}`);
          if (await card.isVisible().catch(() => false)) await highlight(card);
        }
        return finish(page, 'when');
      },
    },
    {
      name: 'lap-lai-dinh-ky',
      caption: 'bước Thời gian khi chọn "Lặp lại định kỳ", khoanh đỏ ô chọn tần suất, giờ gửi và dòng cảnh báo gửi lại toàn bộ danh sách',
      localOnly: true,
      async take(page) {
        await walkTo(page, 'when-recurring');
        await highlight(page.getByTestId('simple-frequency-daily'));
        await highlight(page.locator('#simple-recurring-time'));
        await highlight(page.getByTestId('simple-recurring-warning'));
        return finish(page, 'when');
      },
    },
    {
      name: 'buoc-xem-lai',
      caption: 'bước Xem lại, khoanh đỏ câu tóm tắt, khung ước tính thời gian, ô "Tên chiến dịch" và nút "Bắt đầu gửi"',
      localOnly: true,
      async take(page) {
        await walkTo(page, 'review');
        await highlight(page.getByTestId('simple-summary'));
        const estimate = page.getByText('Ước tính thời gian gửi', { exact: true }).first();
        if (await estimate.isVisible().catch(() => false)) await highlight(estimate);
        await highlight(page.locator('#simple-campaign-name'));
        await highlight(page.getByTestId('simple-start'));
        // KHÔNG bấm "Bắt đầu gửi": bấm là tạo chiến dịch và gửi tin thật.
        return finish(page, 'review');
      },
    },
  ],
};
