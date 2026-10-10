import { CHANNEL_ACCOUNT_NOT_ASSIGNED_CODE } from '../services/user/memberChannelAccess.service.js';

/**
 * PLAN_GIAO_TK_TG_WA PR-H2 — nếu `error` là "nhân viên chưa được giao tài khoản Telegram / WhatsApp" thì trả 403 kèm `code`
 * (FE phân biệt với lỗi khác) và báo đã xử lý. Dùng ở đầu `catch` của handler đã gọi `assertChannelAccountAccess`.
 *
 * @param {import('express').Response} res
 * @param {unknown} error
 * @returns {boolean} true nếu đã trả lời
 */
export function respondIfChannelNotAssigned(res, error) {
  if (error?.code !== CHANNEL_ACCOUNT_NOT_ASSIGNED_CODE) return false;
  res.status(403).json({ success: false, code: error.code, message: error.message });
  return true;
}
