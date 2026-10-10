import { serverError } from '../helpers.js';
import { getStorageBackend } from '../services/storage/storageBackend.js';
import {
  addUserMessage,
  closeMyTicket,
  createTicket,
  getMyTicket,
  listMyTickets,
  resolveAttachmentForDownload,
} from '../services/support/supportTicket.service.js';
import { uploadSupportAttachment } from '../services/support/supportTicketAttachment.service.js';

/**
 * Ticket góp ý của NGƯỜI ĐANG ĐĂNG NHẬP (`/api/support/tickets/*`). Luôn theo `req.user.id` — người thao tác thật, không phải
 * chủ workspace. Lỗi nghiệp vụ (có `status` 4xx) trả nguyên `message` + `code`; còn lại 500 chuẩn.
 */

export function respondKnownError(res, error, label) {
  if (error?.status >= 400 && error.status < 500) {
    return res.status(error.status).json({
      success: false,
      message: error.message,
      ...(error.code ? { code: error.code } : {}),
    });
  }
  return serverError(res, label, error);
}

export async function uploadAttachment(req, res) {
  try {
    const data = await uploadSupportAttachment({ file: req.file, user: req.user });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return respondKnownError(res, error, 'upload support attachment');
  }
}

export async function create(req, res) {
  try {
    const data = await createTicket(req.user, req.body || {});
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return respondKnownError(res, error, 'create support ticket');
  }
}

export async function list(req, res) {
  try {
    return res.json({ success: true, data: await listMyTickets(req.user, req.query) });
  } catch (error) {
    return respondKnownError(res, error, 'list support tickets');
  }
}

export async function get(req, res) {
  try {
    return res.json({ success: true, data: await getMyTicket(req.user, req.params.id) });
  } catch (error) {
    return respondKnownError(res, error, 'get support ticket');
  }
}

export async function addMessage(req, res) {
  try {
    const data = await addUserMessage(req.user, req.params.id, req.body || {});
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return respondKnownError(res, error, 'add support ticket message');
  }
}

export async function close(req, res) {
  try {
    return res.json({ success: true, data: await closeMyTicket(req.user, req.params.id) });
  } catch (error) {
    return respondKnownError(res, error, 'close support ticket');
  }
}

/**
 * GET /:id/attachments/:objectId — phát ảnh đính kèm (inline) cho người tạo ticket hoặc super admin.
 * Backend GCS trả 302 sang signed URL ngắn hạn; backend local gửi thẳng tệp. Luôn `Cache-Control: private, no-store`.
 */
export async function streamAttachment(req, res) {
  try {
    const file = await resolveAttachmentForDownload(req.user, req.params.id, req.params.objectId);
    res.setHeader('Cache-Control', 'private, no-store');
    const ok = await getStorageBackend().stream(file.storageKey, res, {
      fileName: file.name,
      mimeType: file.mime,
      preview: true,
    });
    if (!ok && !res.headersSent) {
      return res.status(404).json({
        success: false,
        code: 'SUPPORT_ATTACHMENT_NOT_FOUND',
        message: 'Ảnh không còn trong kho lưu trữ',
      });
    }
    return undefined;
  } catch (error) {
    if (res.headersSent) return undefined;
    return respondKnownError(res, error, 'stream support attachment');
  }
}
