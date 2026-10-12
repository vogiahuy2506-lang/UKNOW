import formService from '../services/form.service.js';
import { clientIpKey } from '../middleware/rateLimiter.middleware.js';
import { getStorageBackend } from '../services/storage/storageBackend.js';
import { verifyFormFileDownloadToken, FORM_FILE_DOWNLOAD_TTL_MS } from '../utils/formFileToken.util.js';

class FormPublicController {
  async getPublic(req, res) {
    try {
      const { publicKey } = req.params;
      const form = await formService.getPublicForm(publicKey);
      return res.json({
        success: true,
        data: form,
      });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[FormPublicController.getPublic]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể tải biểu mẫu',
        code: error.code || 'INTERNAL_ERROR',
      });
    }
  }

  async getSlots(req, res) {
    try {
      const { publicKey } = req.params;
      const { from, days } = req.query || {};
      const result = await formService.getPublicSlots(publicKey, { from, days });
      return res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[FormPublicController.getSlots]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể tải danh sách khung giờ',
        code: error.code || 'INTERNAL_ERROR',
      });
    }
  }

  async submitPublic(req, res) {
    try {
      const { publicKey } = req.params;
      // clientIpKey — CÙNG cách lấy IP với publicFormSubmissionLimiter (rateLimiter.middleware.js)
      // để "cùng IP" ở chốt chống giữ chỗ hàng loạt (PR-3a) khớp đúng cách limiter nhóm IP.
      const ipKey = clientIpKey(req);
      const result = await formService.submitPublicForm(publicKey, req.body || {}, ipKey);

      return res.status(201).json({
        success: true,
        message: 'Nộp biểu mẫu thành công',
        data: {
          accessToken: result.accessToken,
          payment: result.payment || null,
        },
      });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[FormPublicController.submitPublic]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể nộp biểu mẫu',
        code: error.code || 'INTERNAL_ERROR',
      });
    }
  }

  /**
   * POST /api/public/forms/:publicKey/uploads — xin URL ký để TRÌNH DUYỆT tải thẳng một tệp (trường `file`) lên kho (PR-4b).
   * Chủ hết dung lượng → 200 `{ quotaExceeded: true, skipToken }` (KHÔNG lỗi cứng — khách vẫn nộp được bài).
   */
  async requestFileUpload(req, res) {
    try {
      const { publicKey } = req.params;
      const data = await formService.requestFileUpload(publicKey, req.body || {});
      return res.status(data.quotaExceeded ? 200 : 201).json({ success: true, data });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[FormPublicController.requestFileUpload]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể tạo liên kết tải tệp',
        code: error.code || 'INTERNAL_ERROR',
      });
    }
  }

  /**
   * PUT /api/public/forms/:publicKey/uploads/:uploadId/content — nhận byte của tệp ở kho CỤC BỘ (máy dev/test). Production dùng
   * GCS: trình duyệt PUT thẳng vào URL ký, không qua route này.
   */
  async receiveFileUpload(req, res) {
    try {
      const { publicKey, uploadId } = req.params;
      const data = await formService.receiveFileUpload(publicKey, uploadId, {
        contentType: req.headers['content-type'],
        contentLength: req.headers['content-length'],
        stream: req,
      });
      return res.json({ success: true, data });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[FormPublicController.receiveFileUpload]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể nhận tệp tải lên',
        code: error.code || 'INTERNAL_ERROR',
      });
    }
  }

  /**
   * GET /api/public/forms/files/:token — phát một tệp khách đã tải lên bằng link NGẮN HẠN mà chủ biểu mẫu lấy qua API có xác thực
   * (`GET /api/forms/:id/submissions/:submissionId/files/:fieldKey/:index/link`). Luôn `attachment` + `nosniff`, không bao giờ inline.
   * Khai TRƯỚC `/:publicKey` (formPublic.routes.js).
   */
  async downloadFile(req, res) {
    let file;
    try {
      file = verifyFormFileDownloadToken(req.params.token);
    } catch {
      return res.status(404).json({
        success: false,
        message: 'Liên kết tải tệp không hợp lệ hoặc đã hết hạn',
        code: 'FILE_LINK_INVALID',
      });
    }
    try {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, no-store');
      const ok = await getStorageBackend().stream(file.storageKey, res, {
        fileName: file.fileName,
        mimeType: file.contentType,
        preview: false,
        signedUrlTtlMs: FORM_FILE_DOWNLOAD_TTL_MS,
      });
      if (!ok && !res.headersSent) {
        return res.status(404).json({
          success: false,
          message: 'Tệp không còn trong kho lưu trữ',
          code: 'FILE_NOT_FOUND',
        });
      }
    } catch (error) {
      console.error('[FormPublicController.downloadFile]', error);
      if (!res.headersSent) {
        return res.status(500).json({ success: false, message: 'Không thể tải tệp', code: 'INTERNAL_ERROR' });
      }
    }
    return undefined;
  }

  /**
   * GET /api/public/forms/:publicKey/submissions/:accessToken — trang trạng thái công khai
   * cho người đặt (PR-3a mục 4). Không gắn limiter riêng — cùng mức với getPublic/getSlots.
   */
  async getSubmissionStatus(req, res) {
    try {
      const { publicKey, accessToken } = req.params;
      const result = await formService.getSubmissionStatus(publicKey, accessToken);
      return res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[FormPublicController.getSubmissionStatus]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể tải trạng thái bài nộp',
        code: error.code || 'INTERNAL_ERROR',
      });
    }
  }

  /**
   * POST /api/public/forms/:publicKey/submissions/:accessToken/report-paid
   * Người đặt bấm "Tôi xác nhận đã chuyển khoản" (PR-2).
   */
  async reportPaymentSent(req, res) {
    try {
      const { publicKey, accessToken } = req.params;
      const result = await formService.reportPaymentSent(publicKey, accessToken);
      return res.json({
        success: true,
        message: 'Đã ghi nhận thông báo chuyển khoản',
        data: result,
      });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[FormPublicController.reportPaymentSent]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể ghi nhận thông báo chuyển khoản',
        code: error.code || 'INTERNAL_ERROR',
      });
    }
  }

  /**
   * POST /api/public/forms/:publicKey/submissions/:accessToken/receipt
   * Khách tải ảnh biên lai chuyển khoản (PR-5).
   */
  async uploadReceipt(req, res) {
    try {
      const { publicKey, accessToken } = req.params;
      const result = await formService.uploadPaymentReceipt(publicKey, accessToken, req.file);
      return res.json({
        success: true,
        message: result.receiptStored
          ? 'Đã tải ảnh chuyển khoản thành công'
          : 'Bên nhận đã hết dung lượng lưu ảnh — bạn vẫn có thể xác nhận',
        data: result,
      });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[FormPublicController.uploadReceipt]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể tải ảnh chuyển khoản',
        code: error.code || 'INTERNAL_ERROR',
      });
    }
  }

  /**
   * GET /api/public/forms/unsubscribe/:token — rút lại đồng ý nhận tiếp thị công khai cho người
   * nộp Biểu mẫu (PR-7b, mô phỏng `lead.controller.js` `unsubscribe`). Trả HTML song ngữ, không
   * auth. Route này khai TRƯỚC `/:publicKey` (`formPublic.routes.js`) — "unsubscribe" không được
   * lọt vào tham số `:publicKey`.
   */
  async unsubscribe(req, res) {
    const token = String(req.params.token || '').trim();
    const privacyPolicyUrl = String(process.env.PRIVACY_POLICY_URL || '').trim()
      || 'https://campaign.digiso.vn/privacy-policy';
    const { statusCode, html } = await formService.withdrawSubmissionConsent({ token, privacyPolicyUrl });
    return res.status(statusCode).send(html);
  }
}

export default new FormPublicController();
