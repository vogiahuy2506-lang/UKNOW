import {
  adminGetTicket,
  adminListTickets,
  adminReply,
  adminSetStatus,
} from '../../services/support/supportTicket.service.js';
import { listSubmissions, updateSubmission } from '../../services/support/contactSubmissionAdmin.service.js';
import { respondKnownError } from '../supportTicket.controller.js';

/**
 * Super admin: ticket của mọi người dùng + liên hệ từ trang chủ (`/api/admin/support/*`). Route đã gác bằng
 * `authMiddleware` + `requireRole('admin')`. Việc tải ảnh lên và phát ảnh dùng chung handler với route người dùng
 * (`supportTicket.controller.js` `uploadAttachment` / `streamAttachment`).
 */

export async function listTickets(req, res) {
  try {
    return res.json({ success: true, data: await adminListTickets(req.query) });
  } catch (error) {
    return respondKnownError(res, error, 'admin list support tickets');
  }
}

export async function getTicket(req, res) {
  try {
    return res.json({ success: true, data: await adminGetTicket(req.params.id) });
  } catch (error) {
    return respondKnownError(res, error, 'admin get support ticket');
  }
}

export async function reply(req, res) {
  try {
    const data = await adminReply(req.user, req.params.id, req.body || {});
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return respondKnownError(res, error, 'admin reply support ticket');
  }
}

export async function setStatus(req, res) {
  try {
    return res.json({ success: true, data: await adminSetStatus(req.user, req.params.id, req.body?.status) });
  } catch (error) {
    return respondKnownError(res, error, 'admin set support ticket status');
  }
}

export async function listContactSubmissions(req, res) {
  try {
    return res.json({ success: true, data: await listSubmissions(req.query) });
  } catch (error) {
    return respondKnownError(res, error, 'admin list contact submissions');
  }
}

export async function patchContactSubmission(req, res) {
  try {
    return res.json({ success: true, data: await updateSubmission(req.params.id, req.body || {}) });
  } catch (error) {
    return respondKnownError(res, error, 'admin update contact submission');
  }
}
