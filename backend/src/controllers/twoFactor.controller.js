/**
 * HTTP cho xác thực hai lớp (status/setup/enable/disable/recovery-codes).
 * Bước verify của đăng nhập nằm ở auth.controller.js (cần logLoginAttempt + issueSessionResponse).
 */
import twoFactorService, { TwoFactorError } from '../services/auth/twoFactor.service.js';
import { getSystemAuditContext } from '../utils/auditContext.util.js';

/**
 * Trả lỗi TwoFactorError theo hợp đồng. @returns {boolean} true nếu đã xử lý
 */
export function sendTwoFactorError(res, err) {
  if (!(err instanceof TwoFactorError)) return false;
  res.status(err.status).json({
    success: false,
    code: err.code,
    message: err.message,
    ...(err.retryAfterSeconds != null ? { retryAfterSeconds: err.retryAfterSeconds } : {}),
  });
  return true;
}

function wrap(handler) {
  return async (req, res) => {
    try {
      return await handler(req, res);
    } catch (err) {
      if (sendTwoFactorError(res, err)) return undefined;
      console.error('Two-factor error:', err);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  };
}

export const getStatus = wrap(async (req, res) => {
  const data = await twoFactorService.getStatus(req.user.id);
  return res.json({ success: true, data });
});

export const beginSetup = wrap(async (req, res) => {
  const data = await twoFactorService.beginSetup(req.user);
  return res.json({ success: true, data });
});

export const enable = wrap(async (req, res) => {
  const data = await twoFactorService.confirmSetup(req.user.id, req.body.code, {
    auditContext: getSystemAuditContext(req),
  });
  return res.json({ success: true, message: 'Đã bật xác thực hai lớp', data });
});

export const disable = wrap(async (req, res) => {
  const data = await twoFactorService.disable(
    req.user,
    { code: req.body.code, password: req.body.password },
    { auditContext: getSystemAuditContext(req) }
  );
  return res.json({ success: true, message: 'Đã tắt xác thực hai lớp', data });
});

export const regenerateRecoveryCodes = wrap(async (req, res) => {
  const data = await twoFactorService.regenerateRecoveryCodes(req.user.id, req.body.code, {
    auditContext: getSystemAuditContext(req),
  });
  return res.json({ success: true, data });
});
