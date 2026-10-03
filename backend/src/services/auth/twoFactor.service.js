/**
 * Xác thực hai lớp (TOTP RFC 6238 + mã khôi phục) — PLAN_XAC_THUC_HAI_LOP_2FA mục 4 Việc 5.
 * Lỗi nghiệp vụ ném TwoFactorError (status + code [+ retryAfterSeconds]) để controller trả đúng hợp đồng.
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import * as twoFactorRepo from '../../repositories/user/userTwoFactor.repository.js';
import { generateSecret, verifyTotp, buildOtpauthUrl } from '../../utils/totp.util.js';
import { encryptTotpSecret, decryptTotpSecret } from '../../utils/totpSecretCrypto.util.js';
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  looksLikeRecoveryCode,
} from '../../utils/recoveryCodes.util.js';
import { logSystem, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit.service.js';

export const CHALLENGE_PURPOSE = 'two_factor_challenge';
export const CHALLENGE_TTL = '5m';
export const LOCK_AFTER_FAILED = 5;
export const LOCK_MINUTES = 15;
const JWT_VERIFY_OPTIONS = { algorithms: ['HS256'] };

export class TwoFactorError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.name = 'TwoFactorError';
    this.status = status;
    this.code = code;
    Object.assign(this, extra);
  }
}

const invalidCode = () => new TwoFactorError(401, 'TWO_FACTOR_CODE_INVALID', 'Mã xác thực không đúng hoặc đã hết hạn');

async function audit(ctx, action, userId, details) {
  // Mất một dòng audit không được làm hỏng thao tác bảo mật vừa thành công.
  try {
    await logSystem({ ...ctx, userId: ctx?.userId ?? userId }, action, AUDIT_ENTITY_TYPES.USER, userId, details);
  } catch (err) {
    console.warn(`[2FA] Không ghi được audit ${action}:`, err?.message || err);
  }
}

function lockedError(lockedUntil, now) {
  const retryAfterSeconds = Math.max(1, Math.ceil((new Date(lockedUntil).getTime() - now) / 1000));
  return new TwoFactorError(
    403,
    'TWO_FACTOR_LOCKED',
    `Nhập sai quá nhiều lần. Vui lòng thử lại sau ${Math.ceil(retryAfterSeconds / 60)} phút.`,
    { retryAfterSeconds }
  );
}

export async function getStatus(userId, client) {
  const [row, creds] = await Promise.all([
    twoFactorRepo.findByUserId(userId, client),
    twoFactorRepo.findUserCredentials(userId, client),
  ]);
  const enabled = Boolean(row?.enabled_at);
  return {
    enabled,
    enabledAt: enabled ? row.enabled_at : null,
    recoveryCodesLeft: enabled && Array.isArray(row.recovery_codes) ? row.recovery_codes.length : 0,
    requiresPasswordToDisable: (creds?.auth_provider || 'local') === 'local',
  };
}

export async function beginSetup(user) {
  const existing = await twoFactorRepo.findByUserId(user.id);
  if (existing?.enabled_at) {
    throw new TwoFactorError(409, 'TWO_FACTOR_ALREADY_ENABLED', 'Tài khoản đã bật xác thực hai lớp');
  }
  const secret = generateSecret();
  const saved = await twoFactorRepo.upsertPending(user.id, encryptTotpSecret(secret));
  if (!saved) {
    throw new TwoFactorError(409, 'TWO_FACTOR_ALREADY_ENABLED', 'Tài khoản đã bật xác thực hai lớp');
  }
  const otpauthUrl = buildOtpauthUrl({ account: user.username || user.email, secret });
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
  return { secret, otpauthUrl, qrDataUrl };
}

export async function confirmSetup(userId, code, { auditContext, now = Date.now() } = {}) {
  const row = await twoFactorRepo.findByUserId(userId);
  if (!row || row.enabled_at) {
    throw new TwoFactorError(400, 'TWO_FACTOR_NOT_PENDING', 'Chưa có phiên cài đặt xác thực hai lớp đang chờ xác nhận');
  }
  const result = verifyTotp(decryptTotpSecret(row.secret_enc), code, { timestampMs: now });
  if (!result.ok) throw invalidCode();

  const recoveryCodes = generateRecoveryCodes(8);
  const enabled = await twoFactorRepo.enable(userId, {
    recoveryHashes: recoveryCodes.map(hashRecoveryCode),
    lastUsedStep: result.step,
  });
  if (!enabled) {
    throw new TwoFactorError(400, 'TWO_FACTOR_NOT_PENDING', 'Chưa có phiên cài đặt xác thực hai lớp đang chờ xác nhận');
  }
  await audit(auditContext, AUDIT_ACTIONS.TWO_FACTOR_ENABLED, userId, {});
  return { recoveryCodes };
}

/**
 * Kiểm mã (TOTP hoặc mã khôi phục) của một user ĐÃ BẬT 2FA, kèm khoá/đếm sai.
 * @returns {Promise<{ method: 'totp'|'recovery' }>}
 */
export async function verifyCodeForUser(userId, code, { client, auditContext, allowRecovery = true, now = Date.now() } = {}) {
  const row = await twoFactorRepo.findByUserId(userId, client);
  if (!row || !row.enabled_at) throw invalidCode();

  if (row.locked_until && new Date(row.locked_until).getTime() > now) {
    throw lockedError(row.locked_until, now);
  }

  let ok = false;
  let method = 'totp';
  const raw = typeof code === 'string' ? code.trim() : '';
  if (looksLikeRecoveryCode(raw)) {
    if (allowRecovery) {
      method = 'recovery';
      ok = (await twoFactorRepo.consumeRecoveryCode(userId, hashRecoveryCode(raw), client)) > 0;
    }
  } else {
    const result = verifyTotp(decryptTotpSecret(row.secret_enc), raw, {
      timestampMs: now,
      lastUsedStep: row.last_used_step == null ? null : Number(row.last_used_step),
    });
    // markStepUsed atomic: hai request đua nhau cùng một mã thì chỉ một cái qua.
    ok = result.ok && (await twoFactorRepo.markStepUsed(userId, result.step, client)) > 0;
  }

  if (!ok) {
    const failed = await twoFactorRepo.bumpFailed(userId, { lockAfter: LOCK_AFTER_FAILED, lockMinutes: LOCK_MINUTES }, client);
    if (failed?.locked_until && new Date(failed.locked_until).getTime() > now) {
      throw lockedError(failed.locked_until, now);
    }
    throw invalidCode();
  }

  await twoFactorRepo.resetFailed(userId, client);
  if (method === 'recovery') {
    await audit(auditContext, AUDIT_ACTIONS.TWO_FACTOR_RECOVERY_USED, userId, {});
  }
  return { method };
}

export async function disable(user, { code, password }, { auditContext } = {}) {
  const status = await getStatus(user.id);
  if (!status.enabled) {
    throw new TwoFactorError(400, 'TWO_FACTOR_NOT_ENABLED', 'Tài khoản chưa bật xác thực hai lớp');
  }
  const creds = await twoFactorRepo.findUserCredentials(user.id);
  if ((creds?.auth_provider || 'local') === 'local') {
    const okPassword = typeof password === 'string' && password.length > 0
      && await bcrypt.compare(password, creds.password_hash);
    if (!okPassword) {
      throw new TwoFactorError(401, 'TWO_FACTOR_PASSWORD_INVALID', 'Mật khẩu không đúng');
    }
  }
  await verifyCodeForUser(user.id, code, { auditContext });
  await twoFactorRepo.deleteByUserId(user.id);
  await audit(auditContext, AUDIT_ACTIONS.TWO_FACTOR_DISABLED, user.id, {});
  return { enabled: false };
}

export async function regenerateRecoveryCodes(userId, code, { auditContext } = {}) {
  const status = await getStatus(userId);
  if (!status.enabled) {
    throw new TwoFactorError(400, 'TWO_FACTOR_NOT_ENABLED', 'Tài khoản chưa bật xác thực hai lớp');
  }
  // Chỉ nhận mã TOTP hiện tại (không cho dùng một mã khôi phục để đẻ ra bộ mới).
  await verifyCodeForUser(userId, code, { auditContext, allowRecovery: false });
  const recoveryCodes = generateRecoveryCodes(8);
  await twoFactorRepo.replaceRecoveryCodes(userId, recoveryCodes.map(hashRecoveryCode));
  return { recoveryCodes };
}

export function issueChallengeToken(user, { method, rememberMe }) {
  return jwt.sign(
    { userId: user.id, purpose: CHALLENGE_PURPOSE, method, rememberMe: rememberMe !== false, jti: uuidv4() },
    process.env.JWT_SECRET,
    { expiresIn: CHALLENGE_TTL, algorithm: 'HS256' }
  );
}

export function verifyChallengeToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, JWT_VERIFY_OPTIONS);
  } catch {
    throw invalidCode();
  }
  if (!payload || payload.purpose !== CHALLENGE_PURPOSE || !payload.userId) throw invalidCode();
  return payload;
}

/** Super admin xoá dòng 2FA của một tài khoản (mất máy). @returns {{ hadTwoFactor: boolean }} */
export async function adminReset(targetUserId, { auditContext, email } = {}) {
  const hadTwoFactor = await twoFactorRepo.deleteByUserId(targetUserId);
  await audit(auditContext, AUDIT_ACTIONS.TWO_FACTOR_RESET_BY_ADMIN, targetUserId, { email, hadTwoFactor });
  return { hadTwoFactor };
}

export default {
  getStatus,
  beginSetup,
  confirmSetup,
  verifyCodeForUser,
  disable,
  regenerateRecoveryCodes,
  issueChallengeToken,
  verifyChallengeToken,
  adminReset,
};
