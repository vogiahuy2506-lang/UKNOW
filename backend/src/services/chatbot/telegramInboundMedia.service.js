/**
 * P5 buoc 5 - anh/tai lieu khach gui toi Telegram (mtcute). Webhook chi nhan METADATA (`media`); byte tai o day qua
 * gateway (`downloadMedia`, cung nhom `guard/wrap` voi sendMessage nen ket qua bi boc `{ data }`), roi luu vao kho chat
 * cua CHU tai khoan (`channelInboundMedia.service`). Tach file rieng de `internal.routes.js` chi nap khi that su co media
 * (webhook khong keo them gateway/kho tep vao moi tin chu).
 */
import telegramGateway from './telegramGateway.client.js';
import {
  INBOUND_MEDIA_MAX_BYTES,
  buildInboundMediaContent,
  storeInboundMedia,
} from './channelInboundMedia.service.js';

/** Webhook loopback (`inboxForwarder`) cho 15s; tai + luu phai xong truoc do, khong thi luu placeholder kem ly do. */
export const TELEGRAM_MEDIA_DOWNLOAD_TIMEOUT_MS = 12_000;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`download timeout ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * @param {{ account: {id_user: number, telegram_user_id: number|string}, parsed: {media: object, chatId: string, messageId: number|null, message?: string} }} input
 * @returns {Promise<{ content: string, attachments: Array<object>, skipReason: string|null, kind: 'image'|'file' }>}
 */
export async function resolveTelegramInboundMedia({ account, parsed }) {
  const media = parsed.media;
  const kind = media.kind === 'photo' ? 'image' : 'file';
  let attachment = null;
  let skipReason = null;

  if (media.size != null && media.size > INBOUND_MEDIA_MAX_BYTES) {
    skipReason = 'too_large';
  } else if (parsed.messageId == null || !parsed.chatId) {
    skipReason = 'error';
  } else {
    try {
      const response = await withTimeout(
        telegramGateway.downloadMedia(
          account.telegram_user_id,
          parsed.chatId,
          parsed.messageId,
          { maxBytes: INBOUND_MEDIA_MAX_BYTES }
        ),
        TELEGRAM_MEDIA_DOWNLOAD_TIMEOUT_MS
      );
      const downloaded = response?.data ?? response;
      if (downloaded?.tooLarge) {
        skipReason = 'too_large';
      } else if (!downloaded?.buffer) {
        skipReason = 'error';
      } else {
        ({ attachment, skipReason } = await storeInboundMedia({
          ownerUserId: account.id_user,
          buffer: downloaded.buffer,
          fileName: downloaded.fileName || media.fileName,
          mimeType: downloaded.mimeType || media.mimeType,
          kind,
        }));
      }
    } catch (err) {
      skipReason = 'error';
      console.warn(`[Telegram/InboundMedia] tai media that bai: ${err?.message}`);
    }
  }

  return {
    content: buildInboundMediaContent({ caption: parsed.message, kind, skipReason }),
    attachments: attachment ? [attachment] : [],
    skipReason,
    kind,
  };
}

export default { resolveTelegramInboundMedia, TELEGRAM_MEDIA_DOWNLOAD_TIMEOUT_MS };
