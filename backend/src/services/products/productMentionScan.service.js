import productChatMentionRepository from '../../repositories/products/productChatMention.repository.js';
import chatbotContactAlertRepository from '../../repositories/chatbot/chatbotContactAlert.repository.js';
import productRepository from '../../repositories/products/product.repository.js';
import { findMentionedProductIds } from '../../utils/productMentionMatch.util.js';
import { isZaloGroupConversation } from '../../utils/zaloGroupName.util.js';
import { logError } from '../../utils/logger.util.js';

const SOURCES = ['web', 'channel', 'zalo_personal'];
const BATCH_SIZE = Number(process.env.PRODUCT_MENTION_SCAN_BATCH) || 500;
const MAX_RUN_MS = Number(process.env.PRODUCT_MENTION_SCAN_MAX_MS) || 2 * 60 * 1000;
const INITIAL_LOOKBACK_DAYS = 30;

function parseInfo(raw) {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Job quét định kỳ: tin role='visitor' mới → khớp tên/mã sản phẩm đang bán của chủ chatbot →
 * ghi product_chat_mentions. Con trỏ riêng (product_mention_scan_cursors), không đụng đường trả lời chatbot.
 */
export async function scanProductMentions({ now = new Date() } = {}) {
  const startedAt = Date.now();
  const productCache = new Map();
  const getProducts = async (ownerId) => {
    if (!productCache.has(ownerId)) {
      productCache.set(ownerId, await productRepository.findAllByUser(ownerId, { activeOnly: true }));
    }
    return productCache.get(ownerId);
  };

  let scanned = 0;
  let mentions = 0;
  const initializedSources = [];

  for (const source of SOURCES) {
    let lastId = await productChatMentionRepository.getCursor(source);
    if (lastId === null) {
      const since = new Date(now.getTime() - INITIAL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
      const firstId = await productChatMentionRepository.firstVisitorMessageIdSince(source, since);
      lastId = firstId !== null
        ? firstId - 1
        : await productChatMentionRepository.getMaxMessageId(source);
      await productChatMentionRepository.setCursor(source, lastId);
      initializedSources.push(source);
    }

    while (Date.now() - startedAt < MAX_RUN_MS) {
      const messages = await chatbotContactAlertRepository.fetchVisitorMessagesAfter(source, lastId, BATCH_SIZE);
      if (!messages || messages.length === 0) break;
      scanned += messages.length;

      const rows = [];
      for (const msg of messages) {
        try {
          if (source === 'zalo_personal' && isZaloGroupConversation({
            externalId: msg.external_id,
            conversationInfo: parseInfo(msg.visitor_info),
          })) continue;
          const products = await getProducts(msg.id_user);
          for (const productId of findMentionedProductIds(msg.content, products)) {
            rows.push({
              workspaceOwnerId: msg.id_user,
              productId,
              source,
              messageId: msg.id,
              conversationKey: `${source}:${msg.id_conversation}`,
              createdAt: msg.created_at,
            });
          }
        } catch (err) {
          // Một tin lỗi không được làm kẹt con trỏ.
          logError('[ProductMentionScan] Bỏ qua tin lỗi:', err);
        }
      }

      mentions += await productChatMentionRepository.insertMentions(rows);
      lastId = messages[messages.length - 1].id;
      await productChatMentionRepository.setCursor(source, lastId);

      if (messages.length < BATCH_SIZE) break;
    }
  }

  return { scanned, mentions, initializedSources, scannedCount: scanned, synced: mentions };
}

export default { scanProductMentions };
