/**
 * Ảnh minh hoạ cho bài "Tạo chiến dịch từng bước" (/huong-dan/chien-dich-tung-buoc).
 *
 * Trang tạo chiến dịch từng bước (/app/campaigns/simple) giữ trạng thái trong bộ nhớ, không lưu vào storage, nên mỗi ảnh
 * mở trang mới rồi bấm lại từ đầu tới bước cần chụp (`walkTo`). Tám ảnh đầu DỪNG TRƯỚC nút "Bắt đầu gửi": không bấm
 * gửi/đặt lịch nên không tạo chiến dịch, không gửi tin. Vì vậy các ảnh màn kết quả (Đang gửi chiến dịch / Đã hẹn gửi /
 * chờ duyệt) KHÔNG có ô [ẢNH] trong bài.
 *
 * Ảnh cuối (mục "Sau khi tạo: xem và sửa ở tab Thiết lập") cần chiến dịch ĐÃ LƯU nên tạo thật trong DB
 * e2e qua API (`POST /campaigns/simple` và `POST /campaigns`, chỉ tạo NHÁP, không gọi run/schedule) rồi XOÁ ngay sau khi
 * chụp xong (`withCleanup`). Tài khoản e2e đã chạm trần số chiến dịch email do seed nên `raiseEmailCampaignCap` nâng trần tạm
 * (cột `users.max_email_campaigns`) rồi trả lại.
 *
 * Cần `E2E_SEED_ALL=1`: tài khoản email gửi `cskh@uknow.vn`. Dữ liệu seed không có biểu mẫu nên ảnh chỉ dùng nguồn
 * "Tự nhập danh sách". Thẻ "Tự động gửi cho người mới" chỉ hiện với nguồn landing / biểu mẫu / Google Sheet nên không có
 * trong ảnh bước Thời gian (nguồn tự nhập); bài chỉ tả nó bằng chữ.
 *
 * Mọi ảnh trong bước chạy ở máy mình (localOnly): cần tài khoản email đã seed. Thao tác chỉ là điều hướng + gõ vào ô,
 * nhưng giữ localOnly cho khỏi phụ thuộc dữ liệu thật.
 */
import { highlight, hideVolatileChrome, settle, contentShot } from '../lib/shotHelpers.js';
import { api, withDb } from '../lib/shotFixtures.js';

/** Chạy `cleanup` sau khi ảnh đã chụp (capture.spec chụp SAU khi `take` trả về nên không dọn trong `take` được). */
function withCleanup(target, cleanup) {
  return {
    screenshot: async (options) => {
      try {
        return await target.screenshot(options);
      } finally {
        await cleanup().catch((error) => console.log(`  ! dọn chiến dịch thử lỗi: ${error.message}`));
      }
    },
  };
}

/** Nâng trần số chiến dịch email của tài khoản e2etest (cột `users.max_email_campaigns`) thêm `extra`; trả hàm trả lại giá trị cũ. */
async function raiseEmailCampaignCap(extra) {
  const original = await withDb(async (db) => {
    const { rows } = await db.query(`SELECT id, max_email_campaigns FROM users WHERE username = 'e2etest'`);
    const user = rows[0];
    if (user && Number(user.max_email_campaigns) >= 0) {
      await db.query('UPDATE users SET max_email_campaigns = max_email_campaigns + $1 WHERE id = $2', [extra, user.id]);
    }
    return user;
  });
  return async () => {
    if (!original) return;
    await withDb((db) => db.query('UPDATE users SET max_email_campaigns = $1 WHERE id = $2', [original.max_email_campaigns, original.id]));
  };
}

/** Mở một trang trong app (để có origin + token) rồi trả id tài khoản email đầu tiên. */
async function firstEmailSenderId(page) {
  await page.goto('/app/campaigns');
  await settle(page);
  const settings = await api(page, 'GET', '/email-settings?status=active&page=1&limit=100');
  const sender = (settings.items || [])[0];
  if (!sender) throw new Error('DB e2e chưa có tài khoản email — nạp seed với E2E_SEED_ALL=1.');
  return Number(sender.id);
}

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

/**
 * Tạo chiến dịch email nháp có chuỗi hai tin (qua API trên DB e2e), mở trang chi tiết (tab Thiết lập mở sẵn), khoanh đỏ thẻ
 * Tổng quan và danh sách khối rồi chụp; xoá chiến dịch sau khi ảnh đã chụp. Dùng chung cho bài campaign-create.
 */
export async function takeSettingsTab(page) {
  const restoreCap = await raiseEmailCampaignCap(2);
  let campaignId = null;
  try {
    const senderId = await firstEmailSenderId(page);
    const created = await api(page, 'POST', '/campaigns/simple', {
      channel: 'email',
      senderId,
      audience: { type: 'manual', emails: ['an@example.com', 'binh@example.com'] },
      content: { mode: 'custom', subject: 'Ưu đãi tháng 10 dành cho bạn', body: 'Chào bạn, tháng này shop có ưu đãi dành riêng cho khách quen. Bạn xem chi tiết nhé!' },
      followUps: [{ delayValue: 2, delayUnit: 'days', content: { mode: 'custom', subject: 'Nhắc nhẹ: ưu đãi sắp hết hạn', body: 'Chào bạn, ưu đãi tháng 10 sắp kết thúc. Bạn đừng bỏ lỡ nhé!' } }],
      campaignName: 'Ưu đãi tháng 10',
    });
    campaignId = created?.id ?? created?.campaign?.id ?? created?.campaignId;
    if (!campaignId) throw new Error(`POST /campaigns/simple không trả id: ${JSON.stringify(created).slice(0, 200)}`);

    // Khung cao để thấy cả Tổng quan lẫn các thẻ khối (thanh Log chạy chiến dịch dính đáy khung).
    await page.setViewportSize({ width: 1440, height: 1070 });
    // Chiến dịch đã có mở vào tab "Thiết lập" (`?tab=settings` là mặc định).
    await page.goto(`/app/campaigns/${campaignId}`);
    const panel = page.getByTestId('campaign-settings-panel');
    await panel.waitFor({ state: 'visible', timeout: 30_000 });
    await page.getByTestId('settings-node-card').first().waitFor({ state: 'visible', timeout: 30_000 });
    await settle(page);
    await hideVolatileChrome(page);
    await highlight(page.getByTestId('settings-overview'));
    const cards = page.getByTestId('settings-node-card');
    for (let i = 0; i < await cards.count(); i += 1) await highlight(cards.nth(i));
    await page.waitForTimeout(200);
    const shot = await contentShot(page, page.getByTestId('campaign-view-tabs').locator('xpath=../..'), { pad: 20, maxHeight: 1070 });
    return withCleanup(shot, async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await api(page, 'DELETE', `/campaigns/${campaignId}`);
      await restoreCap();
    });
  } catch (error) {
    if (campaignId) await api(page, 'DELETE', `/campaigns/${campaignId}`).catch(() => {});
    await restoreCap();
    throw error;
  }
}

export default {
  slug: 'chien-dich-tung-buoc',
  shots: [
    {
      name: 'hop-chon-cach-tao',
      caption: 'hộp chọn cách tạo chiến dịch, khoanh đỏ thẻ "Từng bước" và thẻ "Thủ công" bên cạnh',
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
    {
      name: 'tab-thiet-lap',
      caption: 'tab Thiết lập của một chiến dịch email, khoanh đỏ thẻ Tổng quan và danh sách khối theo thứ tự chạy',
      localOnly: true,
      take: takeSettingsTab,
    },
  ],
};
