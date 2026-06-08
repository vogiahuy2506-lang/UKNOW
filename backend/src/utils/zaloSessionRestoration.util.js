/**
 * Khôi phục tất cả session Zalo đã được kết nối trước đó.
 *
 * Chạy khi:
 * 1. Server khởi động lần đầu
 * 2. Sau khi deploy/update code mới
 * 3. Scheduler chạy định kỳ mỗi 15 phút
 *
 * Flow:
 * 1. Tìm tất cả account có status='connected' và is_active=true trong DB
 * 2. Với mỗi account, thử khôi phục session từ cookie_text đã lưu
 * 3. Nếu khôi phục thành công → lưu API vào memory và đăng ký listener
 * 4. Nếu thất bại → đánh dấu là disconnected trong DB
 */

import campaignZaloSenderService from '../services/campaign/campaignZaloSender.service.js';
import zaloPersonalInboxService from '../services/chatbot/zaloInbox.service.js';
import { addPendingAccount } from '../services/zalo/zaloAccountRegistry.service.js';

/**
 * Khởi tạo khôi phục session Zalo cho tất cả account đã kết nối.
 *
 * @returns {Promise<{ total: number, restored: number, failed: number }>}
 */
export async function initZaloSessionRestoration() {
  console.log('[ZaloRestore] Bắt đầu khôi phục session Zalo...');

  try {
    const result = await campaignZaloSenderService.restoreDisconnectedZaloAccounts();

    if (result.total === 0) {
      console.log('[ZaloRestore] Không có tài khoản Zalo nào cần khôi phục');
      return result;
    }

    console.log(
      `[ZaloRestore] Hoàn thành: ${result.restored}/${result.total} tài khoản được khôi phục, ${result.failed} thất bại`
    );

    // Sau khi restore, đăng ký listeners cho các account đã khôi phục
    if (result.restored > 0) {
      // Invalidate cache trước
      zaloPersonalInboxService.invalidateAccountCache();

      // Add restored accounts to pending list for listener registration
      // (The restoreDisconnectedZaloAccounts function already stores API in memory
      // but we need to ensure listeners are registered)
      try {
        await zaloPersonalInboxService.refreshListeners(true);
        console.log('[ZaloRestore] Đã làm mới inbox listeners cho các session đã khôi phục');
      } catch (inboxError) {
        console.warn('[ZaloRestore] Lỗi khi làm mới inbox listeners:', inboxError.message);
      }
    }

    return result;
  } catch (error) {
    console.error('[ZaloRestore] Lỗi nghiêm trọng khi khôi phục session Zalo:', error.message);
    return { total: 0, restored: 0, failed: 0 };
  }
}
