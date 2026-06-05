import db from '../config/database.js';
import downloadRepository from '../repositories/download.repository.js';
import uploadController from './upload.controller.js';
import { verifyFileToken } from '../utils/fileDownloadToken.js';
import { generateFileToken } from '../utils/fileDownloadToken.js';
import { serverError } from '../helpers.js';

class DownloadController {
  /**
   * Stream file local theo storage key ra HTTP response.
   *
   * Luồng hoạt động:
   * 1. Chuẩn hóa key và kiểm tra tồn tại file trong uploads.
   * 2. Thiết lập Content-Type và Content-Disposition theo chế độ preview/download.
   * 3. Trả file bằng `sendFile` để trình duyệt hiển thị hoặc tải về.
   *
   * @param {import('express').Response} res
   * @param {{ storageKey: string, fileName?: string, mimeType?: string, preview?: boolean }} opts
   * @returns {Promise<boolean>} true nếu đã gửi thành công, false nếu file không tồn tại
   */
  async sendLocalFile(res, { storageKey, fileName = 'file', mimeType = '', preview = false }) {
    const normalizedKey = uploadController.normalizeStorageKey(storageKey);
    const filePath = uploadController.resolveAbsolutePathFromKey(normalizedKey);
    if (!normalizedKey || !filePath) return false;
    try {
      await uploadController.readFileBufferByKey(normalizedKey);
    } catch {
      return false;
    }
    const safeName = String(fileName || 'file').replace(/"/g, '');
    const disposition = preview ? 'inline' : `attachment; filename="${safeName}"`;
    if (mimeType) {
      res.setHeader('Content-Type', mimeType);
    }
    res.setHeader('Content-Disposition', disposition);
    /** Ảnh nhúng từ trang frontend khác origin — bổ sung CORP để chắc chắn không bị chặn (nginx/proxy có thể ghi đè Helmet). */
    if (preview) {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
    res.sendFile(filePath);
    return true;
  }

  /** IP thực từ request (hỗ trợ proxy) */
  _getIp(req) {
    return (
      String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.socket?.remoteAddress ||
      null
    );
  }

  /**
   * Ghi nhận sự kiện truy cập file vào file_access_events + customer_journey.
   * @param {{ fileRow, eventType, storageKey, campaignId, customerId, email, ip, ua }} opts
   */
  async _logAccessEvent({ fileRow, eventType, storageKey, campaignId, customerId, email, ip, ua }) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // 1. Ghi file_access_events
      await client.query(
        `INSERT INTO file_access_events
           (file_id, campaign_id, customer_id, email, event_type, ip_address, user_agent, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
        [fileRow?.id || null, campaignId || null, customerId || null, email || null, eventType, ip, ua]
      );

      // 2. Ghi customer_journey
      if (customerId) {
        const journeyEventType =
          eventType === 'OPEN' ? 'file_link_open' : 'file_download';
        const displayName = fileRow?.display_name || fileRow?.original_name || storageKey;
        await client.query(
          `INSERT INTO customer_journey
             (id_customer, id_campaign, event_type, event_channel, event_data, event_at)
           VALUES ($1, $2, $3, 'email', $4::jsonb, CURRENT_TIMESTAMP)`,
          [
            customerId,
            campaignId || null,
            journeyEventType,
            JSON.stringify({
              storageKey,
              displayName: fileRow?.display_name || '',
              originalName: fileRow?.original_name || '',
              description: eventType === 'OPEN'
                ? `Khách hàng đã mở link xem tệp: ${displayName}`
                : `Khách hàng đã tải tệp: ${displayName}`,
            }),
          ]
        );

        if (campaignId) {
          await client.query(
            `UPDATE campaign_customers
             SET last_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE id_campaign = $1 AND id_customer = $2`,
            [campaignId, customerId]
          );
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('File access event log error:', err);
    } finally {
      client.release();
    }
  }

  /** Lấy metadata file từ DB theo storage_key */
  async _getFileRow(storageKey) {
    return downloadRepository.findFileByStorageKey(storageKey);
  }

  /**
   * Render trang xem file (OPEN event).
   * GET /file/:token
   */
  async handleView(req, res) {
    try {
      const token = String(req.params.token || '').trim();

      let decoded;
      try {
        decoded = verifyFileToken(token);
      } catch {
        return res.status(400).send(this._errorPage('Link xem file không hợp lệ hoặc đã hết hạn.'));
      }

      const { sk: storageKey, c: campaignId, u: customerId, e: email } = decoded;
      if (!storageKey) {
        return res.status(400).send(this._errorPage('Link không hợp lệ.'));
      }

      const fileRow = await this._getFileRow(storageKey);

      // Ghi OPEN event (không block render)
      this._logAccessEvent({
        fileRow, eventType: 'OPEN', storageKey, campaignId, customerId,
        email: email || null,
        ip: this._getIp(req), ua: req.get('user-agent') || null,
      }).catch(() => {});

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const previewUrl = `${baseUrl}/file/${encodeURIComponent(token)}/download?preview=true`;
      const downloadUrl = `${req.protocol}://${req.get('host')}/file/${encodeURIComponent(token)}/download`;
      const mimeType = fileRow?.mime_type || '';
      const displayName = fileRow?.display_name || fileRow?.original_name || 'Tệp đính kèm';
      const originalName = fileRow?.original_name || '';

      return res.send(this._viewerPage({ displayName, originalName, mimeType, previewUrl, downloadUrl }));
    } catch (err) {
      console.error('Lỗi handleView:', err);
      return res.status(500).send(this._errorPage('Lỗi server. Vui lòng thử lại sau.'));
    }
  }

  /**
   * Tải xuống file (DOWNLOAD event).
   * GET /file/:token/download
   */
  async handleDownload(req, res) {
    try {
      const token = String(req.params.token || '').trim();

      let decoded;
      try {
        decoded = verifyFileToken(token);
      } catch {
        return res.status(400).send(this._errorPage('Link tải không hợp lệ hoặc đã hết hạn.'));
      }

      const { sk: storageKey, c: campaignId, u: customerId, e: email } = decoded;
      if (!storageKey) {
        return res.status(400).send(this._errorPage('Link không hợp lệ.'));
      }

      const fileRow = await this._getFileRow(storageKey);

      // Ghi DOWNLOAD event
      await this._logAccessEvent({
        fileRow, eventType: 'DOWNLOAD', storageKey, campaignId, customerId,
        email: email || null,
        ip: this._getIp(req), ua: req.get('user-agent') || null,
      });

      try {
        const fileName = fileRow?.original_name || storageKey.split('/').pop() || 'file';
        const preview = req.query.preview === 'true';
        const sent = await this.sendLocalFile(res, {
          storageKey,
          fileName,
          mimeType: fileRow?.mime_type || '',
          preview,
        });
        if (sent) return;
        return res.status(404).send(this._errorPage('Không tìm thấy tệp hoặc tệp đã bị xóa.'));
      } catch (localErr) {
        console.error('Local download error:', localErr);
        return res.status(404).send(this._errorPage('Không tìm thấy tệp hoặc tệp đã bị xóa.'));
      }
    } catch (err) {
      console.error('Lỗi handleDownload:', err);
      return res.status(500).send(this._errorPage('Lỗi server. Vui lòng thử lại sau.'));
    }
  }

  /**
   * Tracking tải tệp đính kèm từ email (ATTACHMENT_DOWNLOADED).
   * Endpoint công khai — không cần auth.
   * Dedup: chỉ ghi 1 sự kiện per (id_email_message, id_customer) hoặc per (campaign_id, customer_id, storageKey).
   * GET /track/attachment/:token
   */
  async trackAttachmentDownload(req, res) {
    const token = String(req.params.token || '').trim();

    let decoded;
    try {
      decoded = verifyFileToken(token);
    } catch {
      return res.status(400).send(this._errorPage('Link tải tệp không hợp lệ hoặc đã hết hạn.'));
    }

    const { sk: storageKey, c: campaignId, u: customerId, e: email, n: displayName, et: emailTrackingToken } = decoded;
    if (!storageKey) {
      return res.status(400).send(this._errorPage('Link không hợp lệ.'));
    }

    // Tra cứu email_message theo tracking token
    let emailMessageId = null;
    let emailRunId = null;
    if (emailTrackingToken) {
      try {
        const emailMsg = await downloadRepository.findEmailMessageByTrackingToken(emailTrackingToken);
        emailMessageId = emailMsg?.id || null;
        emailRunId = emailMsg?.id_run || null;
      } catch { /* ignore */ }
    }

    // Lấy thông tin file một lần để dùng cho cả tracking lẫn trả file local
    const fileRow = await this._getFileRow(storageKey).catch(() => null);

    // Fallback: nếu token không có customerId, tra cứu qua email
    let resolvedCustomerId = customerId || null;
    if (!resolvedCustomerId && email) {
      try {
        const customer = await downloadRepository.findCustomerByEmail(email);
        resolvedCustomerId = customer?.id || null;
      } catch { /* ignore */ }
    }

    // Ghi sự kiện (có dedup)
    if (resolvedCustomerId) {
      try {
        const client = await db.getClient();
        try {
          await client.query('BEGIN');

          // Auto-infer open từ download: nếu có emailMessageId và chưa có email_opened
          if (emailMessageId) {
            const existingOpen = await client.query(
              `SELECT 1 FROM customer_journey
               WHERE id_email_message = $1 AND id_customer = $2 AND event_type = 'email_opened'
               LIMIT 1`,
              [emailMessageId, resolvedCustomerId]
            );
            if (existingOpen.rows.length === 0) {
              await client.query(
                `UPDATE email_messages
                 SET open_count = COALESCE(open_count, 0) + 1,
                     first_opened_at = COALESCE(first_opened_at, CURRENT_TIMESTAMP),
                     last_opened_at = CURRENT_TIMESTAMP,
                     status = CASE
                       WHEN status IN ('pending', 'queued', 'sent', 'delivered') THEN 'opened'
                       ELSE status
                     END
                 WHERE id = $1`,
                [emailMessageId]
              );
              if (campaignId) {
                await client.query(
                  `UPDATE campaign_customers
                   SET email_opened_count = COALESCE(email_opened_count, 0) + 1,
                       has_opened = TRUE,
                       first_email_opened_at = COALESCE(first_email_opened_at, CURRENT_TIMESTAMP),
                       last_email_opened_at = CURRENT_TIMESTAMP,
                       last_activity_at = CURRENT_TIMESTAMP,
                       updated_at = CURRENT_TIMESTAMP
                   WHERE id_campaign = $1 AND id_customer = $2`,
                  [campaignId, resolvedCustomerId]
                );
              }
              await client.query(
              `INSERT INTO customer_journey (id_customer, id_campaign, id_run, event_type, event_channel, id_email_message, event_data, event_at)
                 VALUES ($1, $2, $3, 'email_opened', 'email', $4, $5::jsonb, CURRENT_TIMESTAMP)`,
                [
                  resolvedCustomerId,
                  campaignId || null,
                  emailRunId || null,
                  emailMessageId,
                  JSON.stringify({ inferred: true, source: 'attachment_download', description: 'Mở email (suy ra từ tải tệp)' }),
                ]
              );
            }
          }

          // Dedup attachment: mỗi tệp (storageKey) chỉ ghi 1 sự kiện per (email_message, customer)
          // Nếu cùng email có 2 tệp khác nhau, mỗi tệp được ghi riêng độc lập
          let existingEvent;
          if (emailMessageId) {
            existingEvent = await client.query(
              `SELECT 1 FROM customer_journey
               WHERE id_email_message = $1 AND id_customer = $2 AND event_type = 'attachment_downloaded'
                 AND event_data->>'storageKey' = $3
               LIMIT 1`,
              [emailMessageId, resolvedCustomerId, storageKey]
            );
          } else {
            existingEvent = await client.query(
              `SELECT 1 FROM customer_journey
               WHERE id_campaign = $1 AND id_customer = $2 AND event_type = 'attachment_downloaded'
                 AND event_data->>'storageKey' = $3
               LIMIT 1`,
              [campaignId || null, resolvedCustomerId, storageKey]
            );
          }

          if (existingEvent.rows.length === 0) {
            const name = displayName || storageKey.split('/').pop() || 'tệp';
            const originalName = fileRow?.original_name || storageKey.split('/').pop() || name;
            await client.query(
              `INSERT INTO customer_journey
                 (id_customer, id_campaign, id_run, event_type, event_channel, id_email_message, event_data, event_at)
               VALUES ($1, $2, $3, 'attachment_downloaded', 'email', $4, $5::jsonb, CURRENT_TIMESTAMP)`,
              [
                resolvedCustomerId,
                campaignId || null,
                emailRunId || null,
                emailMessageId,
                JSON.stringify({
                  storageKey,
                  fileId:       fileRow?.id || null,
                  displayName:  name,
                  originalName,
                  description:  `Khách hàng đã tải tệp đính kèm: ${name}`,
                }),
              ]
            );

            if (campaignId) {
              await client.query(
                `UPDATE campaign_customers
                 SET last_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                 WHERE id_campaign = $1 AND id_customer = $2`,
                [campaignId, resolvedCustomerId]
              );
            }
          }

          await client.query('COMMIT');
        } catch (logErr) {
          await client.query('ROLLBACK').catch(() => {});
          console.error('Attachment tracking log error:', logErr);
        } finally {
          client.release();
        }
      } catch { /* ignore db errors, still redirect */ }
    }

    // Trả file local trực tiếp
    try {
      const fileName = fileRow?.original_name || storageKey.split('/').pop() || 'file';
      const sent = await this.sendLocalFile(res, {
        storageKey,
        fileName,
        mimeType: fileRow?.mime_type || '',
        preview: false,
      });
      if (sent) return;
      return res.status(404).send(this._errorPage('Không tìm thấy tệp hoặc tệp đã bị xóa.'));
    } catch (localErr) {
      console.error('Local attachment download error:', localErr);
      return res.status(404).send(this._errorPage('Không tìm thấy tệp hoặc tệp đã bị xóa.'));
    }
  }



  /**
   * Tạo URL tải tệp local theo token (dành cho admin xem hành trình).
   * GET /api/attachments/:attachmentId/presigned-download
   * Yêu cầu auth.
   */
  async getPresignedDownload(req, res) {
    try {
      const { attachmentId } = req.params;
      const file = await downloadRepository.findFileById(attachmentId);
      if (!file) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy tệp' });
      }

      const fileName = file.original_name || file.display_name || file.storage_key.split('/').pop() || 'file';
      const isPreview = req.query.preview === 'true';
      const token = generateFileToken(file.storage_key, null, null, null);
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const signedUrl = isPreview
        ? `${baseUrl}/file/${encodeURIComponent(token)}/download?preview=true`
        : `${baseUrl}/file/${encodeURIComponent(token)}/download`;

      return res.json({
        success: true,
        data: {
          url: signedUrl,
          fileName,
          displayName: file.display_name || file.original_name,
          mimeType: file.mime_type || '',
          fileSize: file.file_size || null,
        },
      });
    } catch (err) {
      return serverError(res, 'Lỗi lấy presigned URL tải tệp', err);
    }
  }



  /**
   * Tạo URL tải/xem tệp local theo storage key (dành cho admin xem hành trình).
   * GET /api/attachments/presigned-by-key?key=<storageKey>&preview=true
   * Yêu cầu auth. Chỉ cho phép key có prefix hợp lệ (uploads/).
   *
   * @param {import('express').Request} req - query: { key: string, preview?: 'true' }
   * @param {import('express').Response} res
   */
  async getPresignedDownloadByStorageKey(req, res) {
    try {
      const { key, preview } = req.query;
      if (!key || typeof key !== 'string' || !key.trim()) {
        return res.status(400).json({ success: false, message: 'Thiếu tham số key' });
      }
      const normalizedKey = uploadController.normalizeStorageKey(key.trim());
      // Chỉ cho phép key thuộc prefix uploads/ để tránh truy cập tuỳ tiện
      if (!normalizedKey) {
        return res.status(403).json({ success: false, message: 'Key không hợp lệ' });
      }
      const isPreview = preview === 'true';
      const fileName = normalizedKey.split('/').pop() || 'file';
      const token = generateFileToken(normalizedKey, null, null, null);
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const signedUrl = isPreview
        ? `${baseUrl}/file/${encodeURIComponent(token)}/download?preview=true`
        : `${baseUrl}/file/${encodeURIComponent(token)}/download`;
      return res.json({
        success: true,
        data: { url: signedUrl, fileName },
      });
    } catch (err) {
      return serverError(res, 'Lỗi lấy presigned URL theo storage key', err);
    }
  }

  _errorPage(message) {
    return `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<title>Lỗi</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc}
.card{background:#fff;border-radius:12px;padding:2rem;box-shadow:0 4px 24px rgba(0,0,0,.08);text-align:center;max-width:400px}
h2{color:#ef4444;margin:0 0 .75rem}p{color:#64748b;margin:0}</style></head>
<body><div class="card"><h2>⚠️ Lỗi</h2><p>${message}</p></div></body></html>`;
  }

  _viewerPage({ displayName, originalName, mimeType, previewUrl, downloadUrl }) {
    const isImage = mimeType.startsWith('image/');
    const isPdf   = mimeType === 'application/pdf';
    const isVideo = mimeType.startsWith('video/');
    const isAudio = mimeType.startsWith('audio/');

    let previewBlock = '';
    if (previewUrl) {
      if (isPdf) {
        previewBlock = `<div class="preview-wrap">
  <embed src="${previewUrl}" type="application/pdf" class="pdf-embed" />
</div>`;
      } else if (isImage) {
        previewBlock = `<div class="preview-wrap img-wrap">
  <img src="${previewUrl}" alt="${displayName}" class="img-preview" />
</div>`;
      } else if (isVideo) {
        previewBlock = `<div class="preview-wrap">
  <video controls class="video-preview">
    <source src="${previewUrl}" type="${mimeType}">
    Trình duyệt không hỗ trợ phát video.
  </video>
</div>`;
      } else if (isAudio) {
        previewBlock = `<div class="preview-wrap audio-wrap">
  <audio controls class="audio-preview">
    <source src="${previewUrl}" type="${mimeType}">
    Trình duyệt không hỗ trợ phát audio.
  </audio>
</div>`;
      }
    }

    return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <title>${displayName}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    *{box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;min-height:100vh;
         background:linear-gradient(135deg,#f0f9ff 0%,#e0f2fe 100%);display:flex;flex-direction:column;align-items:center;padding:2rem 1rem}
    .card{background:#fff;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.10);width:100%;max-width:860px;overflow:hidden}
    .card-header{padding:1.5rem 2rem;border-bottom:1px solid #f1f5f9;display:flex;align-items:flex-start;gap:1rem}
    .icon{font-size:2.5rem;line-height:1}
    .meta h1{margin:0 0 .25rem;font-size:1.25rem;font-weight:700;color:#0f172a}
    .meta p{margin:0;font-size:.875rem;color:#64748b}
    .card-body{padding:1.5rem 2rem}
    .btn-download{display:inline-flex;align-items:center;gap:.5rem;background:#2563eb;color:#fff;font-weight:600;
                  font-size:.9375rem;padding:.75rem 1.75rem;border-radius:10px;text-decoration:none;
                  border:none;cursor:pointer;transition:background .15s}
    .btn-download:hover{background:#1d4ed8}
    .preview-wrap{margin-top:1.25rem;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0}
    .pdf-embed{display:block;width:100%;height:70vh;border:none}
    .img-wrap{text-align:center;background:#f8fafc;padding:1rem}
    .img-preview{max-width:100%;max-height:70vh;border-radius:8px}
    .video-preview,.audio-preview{width:100%;display:block;border:none}
    .video-preview{max-height:70vh}
    .audio-wrap{padding:1.5rem;background:#f8fafc}
    .no-preview{text-align:center;padding:2.5rem;color:#94a3b8}
    .no-preview .big-icon{font-size:3rem;display:block;margin-bottom:.75rem}
  </style>
</head>
<body>
  <div class="card">
    <div class="card-header">
      <span class="icon">📎</span>
      <div class="meta">
        <h1>${displayName}</h1>
        ${originalName && originalName !== displayName ? `<p>${originalName}</p>` : ''}
      </div>
    </div>
    <div class="card-body">
      <a href="${downloadUrl}" class="btn-download">⬇ Tải xuống</a>
      ${previewBlock || `<div class="no-preview"><span class="big-icon">📄</span><p>Nhấn nút bên trên để tải tệp về máy.</p></div>`}
    </div>
  </div>
</body>
</html>`;
  }
}

export default new DownloadController();

