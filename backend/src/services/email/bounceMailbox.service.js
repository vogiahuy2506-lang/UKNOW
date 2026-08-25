import { simpleParser } from 'mailparser';
import { ImapFlow } from 'imapflow';
import campaignEmailSenderRepository from '../../repositories/campaign/campaignEmailSender.repository.js';

const DSN_ATTACHMENT_TYPES = new Set([
  'message/delivery-status',
  'message/rfc822',
  'text/plain',
  'text/rfc822-headers',
]);

const MAX_MESSAGES_PER_SYNC = 200;

export class BounceMailboxService {
  constructor() {
    this.isSyncing = false;
  }

  /**
   * Trích xuất trackingToken từ các headers hoặc nội dung email.
   * Format VERP: bounce+<trackingToken>@<domain>
   *
   * @param {object} parsed Mailparser parsed object
   * @returns {string|null}
   */
  extractTrackingToken(parsed) {
    if (!parsed) return null;

    // 1. Kiểm tra header To
    const toAddresses = Array.isArray(parsed.to?.value) ? parsed.to.value : [];
    for (const toItem of toAddresses) {
      const match = String(toItem?.address || '').match(/bounce\+([A-Za-z0-9_.-]+)@/i);
      if (match && match[1]) return match[1];
    }

    // 2. Kiểm tra Delivered-To, X-Original-To, X-Failed-Recipients, Return-Path
    const recipientHeaderKeys = [
      'delivered-to',
      'x-original-to',
      'x-failed-recipients',
      'return-path',
      'envelope-to',
    ];

    for (const key of recipientHeaderKeys) {
      const val = parsed.headers?.get(key);
      if (val) {
        const valStr = typeof val === 'string' ? val : (val.text || JSON.stringify(val));
        const match = valStr.match(/bounce\+([A-Za-z0-9_.-]+)@/i);
        if (match && match[1]) return match[1];
      }
    }

    // 3. Fallback: tìm kiếm trong text hoặc headers đính kèm message/rfc822
    if (Array.isArray(parsed.attachments)) {
      for (const att of parsed.attachments) {
        const ct = String(att.contentType || '').toLowerCase();
        if (att.content && (DSN_ATTACHMENT_TYPES.has(ct) || ct.startsWith('text/') || ct.startsWith('message/'))) {
          const contentStr = att.content.toString('utf8');
          const match = contentStr.match(/bounce\+([A-Za-z0-9_.-]+)@/i);
          if (match && match[1]) return match[1];
        }
      }
    }

    if (parsed.text) {
      const match = parsed.text.match(/bounce\+([A-Za-z0-9_.-]+)@/i);
      if (match && match[1]) return match[1];
    }

    return null;
  }

  /**
   * Phân tích nội dung DSN theo RFC 3464 từ raw message buffer/string.
   *
   * @param {Buffer|string} rawSource
   * @returns {Promise<{ trackingToken: string|null, isDsn: boolean, bounceType: 'hard'|'soft', bounceCode: string|null, bounceReason: string, dsnDate: Date }|null>}
   */
  async parseDsnMessage(rawSource) {
    if (!rawSource) return null;

    const parsed = await simpleParser(rawSource);
    const trackingToken = this.extractTrackingToken(parsed);

    // Kiểm tra các trường hợp auto-reply hoặc thư rác không phải DSN
    const autoSubmitted = parsed.headers?.get('auto-submitted');
    const isAutoReplied = typeof autoSubmitted === 'string' && autoSubmitted.toLowerCase() === 'auto-replied';

    // Tìm kiếm các trường delivery status trong attachments hoặc text
    let action = null;
    let status = null;
    let diagnosticCode = null;

    // Tìm trong attachments kiểu message/delivery-status / text DSN
    const allTextParts = [parsed.text || ''];
    if (Array.isArray(parsed.attachments)) {
      for (const att of parsed.attachments) {
        const ct = String(att.contentType || '').toLowerCase();
        if (att.content && (DSN_ATTACHMENT_TYPES.has(ct) || ct.startsWith('text/') || ct.startsWith('message/'))) {
          allTextParts.push(att.content.toString('utf8'));
        }
      }
    }

    const combinedText = allTextParts.join('\n\n');

    // Regex tìm kiếm RFC 3464 headers (nhận diện cả lớp 2, 4, 5)
    const actionMatch = combinedText.match(/Action:\s*([a-zA-Z]+)/i);
    if (actionMatch) action = actionMatch[1].toLowerCase();

    const statusMatch = combinedText.match(/Status:\s*([2-5]\.\d+\.\d+)/i);
    if (statusMatch) status = statusMatch[1];

    const diagMatch = combinedText.match(/Diagnostic-Code:\s*([^\r\n]+(?:\r?\n\s+[^\r\n]+)*)/i);
    if (diagMatch) diagnosticCode = diagMatch[1].replace(/\r?\n\s+/g, ' ').trim();

    // Nếu là auto-replied và không có DSN status/action -> không coi là DSN
    if (isAutoReplied && !status && !action) {
      return {
        trackingToken,
        isDsn: false,
        bounceType: 'soft',
        bounceCode: null,
        bounceReason: 'Auto-reply (out of office)',
        dsnDate: parsed.date || new Date(),
      };
    }

    // Giao thành công (Status: 2.x.x) -> không phải bounce
    if (status && status.startsWith('2.')) {
      return {
        trackingToken,
        isDsn: false,
        bounceType: 'soft',
        bounceCode: status,
        bounceReason: 'Delivery success DSN',
        dsnDate: parsed.date || new Date(),
      };
    }

    // Xác định bounceType: mặc định là 'soft' để an toàn cho khách hàng
    let bounceType = 'soft';
    if (status) {
      if (status.startsWith('5.')) {
        bounceType = 'hard';
      } else if (status.startsWith('4.')) {
        bounceType = 'soft';
      }
    } else if (action === 'failed') {
      bounceType = 'hard';
    } else if (action === 'delayed') {
      bounceType = 'soft';
    }

    const bounceReason = diagnosticCode
      || (status ? `DSN status ${status}` : '')
      || (action ? `DSN action ${action}` : '')
      || parsed.subject
      || 'Delivery Status Notification (Failure)';

    return {
      trackingToken,
      isDsn: Boolean(status || action),
      bounceType,
      bounceCode: status || null,
      bounceReason: bounceReason.slice(0, 500),
      dsnDate: parsed.date || new Date(),
    };
  }

  /**
   * Xử lý 1 thông điệp DSN từ raw source, đối chiếu DB và cập nhật trạng thái.
   *
   * @param {Buffer|string} rawSource
   * @returns {Promise<{ status: string, trackingToken?: string, bounceType?: string, bounceCode?: string, customerId?: number, isPreview?: boolean, reason?: string }>}
   */
  async processDsnMessage(rawSource) {
    const dsnInfo = await this.parseDsnMessage(rawSource);
    if (!dsnInfo || !dsnInfo.trackingToken) {
      return { status: 'skipped', reason: 'no_tracking_token' };
    }

    // Chặn an toàn: Nếu không phải là DSN hợp lệ (thư thường có trích token, auto-reply, success DSN) -> bỏ qua
    if (!dsnInfo.isDsn) {
      return { status: 'skipped', reason: 'not_a_dsn', token: dsnInfo.trackingToken };
    }

    const msgRow = await campaignEmailSenderRepository.findEmailMessageByTrackingToken(dsnInfo.trackingToken);
    if (!msgRow) {
      return { status: 'skipped', reason: 'message_not_found', token: dsnInfo.trackingToken };
    }

    // 1. Cập nhật bản ghi email_messages
    await campaignEmailSenderRepository.markEmailMessageBounced(
      dsnInfo.trackingToken,
      dsnInfo.dsnDate || new Date(),
      dsnInfo.bounceReason,
      {
        bounceType: dsnInfo.bounceType,
        bounceCode: dsnInfo.bounceCode,
        bounceDetectedVia: 'dsn',
      }
    );

    // 2. Chỉ khi hard bounce và KHÔNG PHẢI tin gửi thử (is_preview = false) thì mới mark khách hàng
    if (dsnInfo.bounceType === 'hard' && !msgRow.is_preview && msgRow.id_customer) {
      await campaignEmailSenderRepository.markCustomerHardBounced(msgRow.id_customer);
    }

    return {
      status: 'bounced',
      trackingToken: dsnInfo.trackingToken,
      bounceType: dsnInfo.bounceType,
      bounceCode: dsnInfo.bounceCode,
      customerId: msgRow.id_customer,
      isPreview: msgRow.is_preview,
    };
  }

  /**
   * Đồng bộ hộp thư bounce qua IMAP.
   * Đọc các thư chưa đọc (\Seen false), bóc DSN, ghi nhận DB và đánh dấu \Seen.
   *
   * @returns {Promise<object>}
   */
  async syncBounceMailbox() {
    const bounceDomain = String(process.env.BOUNCE_DOMAIN || '').trim();
    const imapHost = String(process.env.BOUNCE_IMAP_HOST || '').trim();
    const imapUser = String(process.env.BOUNCE_IMAP_USER || '').trim();
    const imapPass = String(process.env.BOUNCE_IMAP_PASS || '').trim();
    const imapPort = parseInt(process.env.BOUNCE_IMAP_PORT || '993', 10);
    const imapSecure = String(process.env.BOUNCE_IMAP_SECURE ?? 'true').toLowerCase() !== 'false';

    if (!bounceDomain || !imapHost || !imapUser || !imapPass) {
      return { skipped: true, reason: 'missing_bounce_imap_config' };
    }

    if (this.isSyncing) {
      return { skipped: true, reason: 'already_syncing' };
    }

    this.isSyncing = true;
    const stats = {
      processedCount: 0,
      bouncedCount: 0,
      hardBouncedCount: 0,
      softBouncedCount: 0,
      skippedCount: 0,
      errorsCount: 0,
    };

    let client = null;
    try {
      client = new ImapFlow({
        host: imapHost,
        port: imapPort,
        secure: imapSecure,
        auth: {
          user: imapUser,
          pass: imapPass,
        },
        logger: false,
      });

      await client.connect();
      const lock = await client.getMailboxLock('INBOX');

      try {
        const seenUids = [];
        let fetchedCount = 0;

        // Fetch unseen messages
        for await (const message of client.fetch({ seen: false }, { source: true, uid: true, flags: true })) {
          stats.processedCount += 1;
          fetchedCount += 1;
          try {
            const result = await this.processDsnMessage(message.source);
            if (result.status === 'bounced') {
              stats.bouncedCount += 1;
              if (result.bounceType === 'hard') {
                stats.hardBouncedCount += 1;
              } else {
                stats.softBouncedCount += 1;
              }
            } else {
              stats.skippedCount += 1;
            }

            // Gom UID để đánh dấu \Seen sau khi fetch xong
            seenUids.push(message.uid);
          } catch (msgErr) {
            stats.errorsCount += 1;
            console.error(`[BounceMailbox] Lỗi xử lý thư UID ${message.uid}:`, msgErr.message);
            // Không gom vào seenUids để lượt sau thử lại
          }

          if (fetchedCount >= MAX_MESSAGES_PER_SYNC) {
            break;
          }
        }

        // Đánh dấu đã đọc (\Seen) sau khi kết thúc loop fetch
        if (seenUids.length > 0) {
          await client.messageFlagsAdd(seenUids, ['\\Seen'], { uid: true });
        }
      } finally {
        lock.release();
      }

      await client.logout();
    } catch (err) {
      console.error('[BounceMailbox] Lỗi kết nối hoặc đồng bộ hộp thư bounce IMAP:', err.message);
      stats.connectionError = err.message;
    } finally {
      this.isSyncing = false;
      if (client && client.usable) {
        await client.logout().catch(() => {});
      }
    }

    return stats;
  }
}

export default new BounceMailboxService();
