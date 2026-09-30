/**
 * P9 (PLAN_TG_WA_DAY_DU mục 16, bước 3) — bọc request của TRỢ LÝ AI bằng quyền kênh Telegram/WhatsApp theo gói của chủ
 * workspace. Mọi đọc cờ kênh bên dưới (`campaignChannelFlags.util`: registry node, wizard, intent, compiler, kho bài)
 * thấy kênh mà gói không có là TẮT -> trợ lý không dựng node cho kênh đó và nói "mua thêm slot ở Nạp thêm".
 *
 * Đọc quyền lúc gọi (không cache) nên mua slot xong là dựng được ngay. Đọc lỗi -> bỏ qua ngữ cảnh (fail-open như
 * `channelEntitlement.service`); chặn lúc gửi/preflight vẫn còn.
 */
import { getChannelEntitlements } from '../services/campaign/channelEntitlement.service.js';
import { runWithChannelEntitlements } from '../services/campaign/campaignChannelFlags.util.js';

export async function channelEntitlementContext(req, res, next) {
  let entitlements;
  try {
    entitlements = await getChannelEntitlements(req.user);
  } catch (err) {
    console.error('[ChannelEntitlement] middleware skipped:', err.message);
    return next();
  }
  return runWithChannelEntitlements(entitlements, () => next());
}

export default channelEntitlementContext;
