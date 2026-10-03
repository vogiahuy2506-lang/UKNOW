process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-two-factor';
process.env.SMTP_SECRET_KEY = process.env.SMTP_SECRET_KEY || 'unit-test-smtp-secret-key';

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';

/**
 * twoFactor.service với repository giả lập trong bộ nhớ (SQL thật được phủ ở integration
 * tests/integration/auth.twoFactor.test.js). Ở đây ghim LUẬT: khoá sau 5 lần sai, từ chối bước đã dùng,
 * mã khôi phục dùng một lần, Google không cần mật khẩu khi tắt, challenge token đúng purpose.
 */

let row; // dòng user_two_factor giả
let creds; // dòng users giả

const mockRepo = {
  findByUserId: jest.fn(async () => (row ? { ...row } : null)),
  findUserCredentials: jest.fn(async () => creds),
  upsertPending: jest.fn(async (userId, secretEnc) => {
    row = { user_id: userId, secret_enc: secretEnc, enabled_at: null, recovery_codes: [], last_used_step: null, failed_attempts: 0, locked_until: null };
    return true;
  }),
  enable: jest.fn(async (userId, { recoveryHashes, lastUsedStep }) => {
    if (!row || row.enabled_at) return false;
    row.enabled_at = new Date();
    row.recovery_codes = recoveryHashes;
    row.last_used_step = lastUsedStep;
    return true;
  }),
  replaceRecoveryCodes: jest.fn(async (userId, hashes) => { row.recovery_codes = hashes; return true; }),
  consumeRecoveryCode: jest.fn(async (userId, hash) => {
    if (!row.recovery_codes.includes(hash)) return 0;
    row.recovery_codes = row.recovery_codes.filter((h) => h !== hash);
    return 1;
  }),
  markStepUsed: jest.fn(async (userId, step) => {
    if (step > (row.last_used_step ?? -1)) { row.last_used_step = step; return 1; }
    return 0;
  }),
  bumpFailed: jest.fn(async (userId, { lockAfter, lockMinutes }) => {
    row.failed_attempts += 1;
    if (row.failed_attempts >= lockAfter) row.locked_until = new Date(Date.now() + lockMinutes * 60000);
    return { failed_attempts: row.failed_attempts, locked_until: row.locked_until };
  }),
  resetFailed: jest.fn(async () => { row.failed_attempts = 0; row.locked_until = null; }),
  deleteByUserId: jest.fn(async () => { const had = Boolean(row); row = null; return had; }),
};
const mockLogSystem = jest.fn();

jest.unstable_mockModule('../../../repositories/user/userTwoFactor.repository.js', () => mockRepo);
jest.unstable_mockModule('../../audit.service.js', () => ({
  logSystem: mockLogSystem,
  AUDIT_ACTIONS: {
    TWO_FACTOR_ENABLED: 'TWO_FACTOR_ENABLED',
    TWO_FACTOR_DISABLED: 'TWO_FACTOR_DISABLED',
    TWO_FACTOR_RECOVERY_USED: 'TWO_FACTOR_RECOVERY_USED',
    TWO_FACTOR_RESET_BY_ADMIN: 'TWO_FACTOR_RESET_BY_ADMIN',
  },
  AUDIT_ENTITY_TYPES: { USER: 'user' },
}));

const svc = await import('../twoFactor.service.js');
const { totpAt, stepAt } = await import('../../../utils/totp.util.js');
const { decryptTotpSecret } = await import('../../../utils/totpSecretCrypto.util.js');
const bcrypt = (await import('bcryptjs')).default;

const USER = { id: 7, username: 'tester', email: 't@test.local' };
const codeNow = (secret, offsetSteps = 0) => totpAt(secret, { timestampMs: Date.now() + offsetSteps * 30000 });

async function enableFor(user = USER) {
  const { secret } = await svc.beginSetup(user);
  const { recoveryCodes } = await svc.confirmSetup(user.id, codeNow(secret));
  return { secret, recoveryCodes };
}

// Đóng băng đồng hồ ở GIỮA một bước TOTP để ca test không chập chờn khi vắt qua mốc 30 s.
const FROZEN_NOW = (Math.floor(Date.now() / 30000) * 30000) + 10000;

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(FROZEN_NOW);
  row = null;
  creds = { id: USER.id, username: USER.username, email: USER.email, auth_provider: 'local', password_hash: bcrypt.hashSync('Passw0rd!', 4) };
  Object.values(mockRepo).forEach((fn) => fn.mockClear());
  mockLogSystem.mockClear();
});

describe('setup + enable', () => {
  it('beginSetup ghi secret ĐÃ MÃ HOÁ (enc:v1:), trả secret base32 + otpauth + QR', async () => {
    const out = await svc.beginSetup(USER);
    expect(out.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(out.otpauthUrl).toContain('otpauth://totp/Founder%20AI:tester?secret=' + out.secret);
    expect(out.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(row.secret_enc.startsWith('enc:v1:')).toBe(true);
    expect(row.secret_enc).not.toContain(out.secret);
    expect(decryptTotpSecret(row.secret_enc)).toBe(out.secret);
  });

  it('beginSetup khi đã bật → 409 TWO_FACTOR_ALREADY_ENABLED', async () => {
    await enableFor();
    await expect(svc.beginSetup(USER)).rejects.toMatchObject({ status: 409, code: 'TWO_FACTOR_ALREADY_ENABLED' });
  });

  it('confirmSetup đúng mã → 8 mã khôi phục, lưu hash (không lưu thô), ghi last_used_step', async () => {
    const { recoveryCodes } = await enableFor();
    expect(recoveryCodes).toHaveLength(8);
    expect(row.enabled_at).toBeTruthy();
    expect(row.recovery_codes).toHaveLength(8);
    expect(row.recovery_codes.every((h) => /^[0-9a-f]{64}$/.test(h))).toBe(true);
    expect(row.last_used_step).toBe(stepAt(Date.now()));
    expect(mockLogSystem).toHaveBeenCalledWith(expect.anything(), 'TWO_FACTOR_ENABLED', 'user', USER.id, expect.anything());
  });

  it('confirmSetup sai mã → 401; chưa setup → 400 TWO_FACTOR_NOT_PENDING', async () => {
    await expect(svc.confirmSetup(USER.id, '123456')).rejects.toMatchObject({ status: 400, code: 'TWO_FACTOR_NOT_PENDING' });
    await svc.beginSetup(USER);
    await expect(svc.confirmSetup(USER.id, '000000')).rejects.toMatchObject({ status: 401, code: 'TWO_FACTOR_CODE_INVALID' });
  });
});

describe('verifyCodeForUser', () => {
  it('từ chối mã của bước đã dùng (dùng lại trong 30 s), nhận mã bước kế', async () => {
    const { secret } = await enableFor(); // enable đã ghi last_used_step = bước hiện tại
    await expect(svc.verifyCodeForUser(USER.id, codeNow(secret))).rejects.toMatchObject({ status: 401 });
    await expect(svc.verifyCodeForUser(USER.id, codeNow(secret, 1))).resolves.toEqual({ method: 'totp' });
    // và mã bước vừa dùng không dùng lại được
    await expect(svc.verifyCodeForUser(USER.id, codeNow(secret, 1))).rejects.toMatchObject({ status: 401 });
  });

  it('khoá sau 5 lần sai: lần 5 → 403 TWO_FACTOR_LOCKED + retryAfterSeconds ≈ 15 phút; mã đúng sau đó vẫn 403', async () => {
    const { secret } = await enableFor();
    for (let i = 0; i < 4; i += 1) {
      await expect(svc.verifyCodeForUser(USER.id, '000000')).rejects.toMatchObject({ status: 401, code: 'TWO_FACTOR_CODE_INVALID' });
    }
    const fifth = await svc.verifyCodeForUser(USER.id, '000000').catch((e) => e);
    expect(fifth).toMatchObject({ status: 403, code: 'TWO_FACTOR_LOCKED' });
    expect(fifth.retryAfterSeconds).toBeGreaterThan(14 * 60);
    expect(fifth.retryAfterSeconds).toBeLessThanOrEqual(15 * 60);
    await expect(svc.verifyCodeForUser(USER.id, codeNow(secret, 1))).rejects.toMatchObject({ status: 403, code: 'TWO_FACTOR_LOCKED' });
  });

  it('khoá đúng 5 (không phải 6): sau 4 lần sai mã đúng vẫn qua', async () => {
    const { secret } = await enableFor();
    for (let i = 0; i < 4; i += 1) await svc.verifyCodeForUser(USER.id, '000000').catch(() => {});
    await expect(svc.verifyCodeForUser(USER.id, codeNow(secret, 1))).resolves.toEqual({ method: 'totp' });
    expect(row.failed_attempts).toBe(0);
  });

  it('mã khôi phục dùng một lần (có/không dấu gạch, hoa/thường), ghi audit TWO_FACTOR_RECOVERY_USED', async () => {
    const { recoveryCodes } = await enableFor();
    await expect(svc.verifyCodeForUser(USER.id, recoveryCodes[0].toLowerCase())).resolves.toEqual({ method: 'recovery' });
    expect(row.recovery_codes).toHaveLength(7);
    await expect(svc.verifyCodeForUser(USER.id, recoveryCodes[0])).rejects.toMatchObject({ status: 401 });
    await expect(svc.verifyCodeForUser(USER.id, recoveryCodes[1].replace('-', ''))).resolves.toEqual({ method: 'recovery' });
    expect(mockLogSystem).toHaveBeenCalledWith(expect.anything(), 'TWO_FACTOR_RECOVERY_USED', 'user', USER.id, expect.anything());
  });

  it('tài khoản chưa bật (dòng pending/không có) → 401, không lộ trạng thái', async () => {
    await expect(svc.verifyCodeForUser(USER.id, '123456')).rejects.toMatchObject({ status: 401 });
    await svc.beginSetup(USER);
    await expect(svc.verifyCodeForUser(USER.id, '123456')).rejects.toMatchObject({ status: 401 });
  });
});

describe('disable / recovery-codes', () => {
  it('local: thiếu/sai mật khẩu → 401 và KHÔNG xoá dòng; đủ mật khẩu + mã → xoá', async () => {
    const { recoveryCodes } = await enableFor();
    await expect(svc.disable(USER, { code: recoveryCodes[0] })).rejects.toMatchObject({ status: 401 });
    await expect(svc.disable(USER, { code: recoveryCodes[0], password: 'sai' })).rejects.toMatchObject({ status: 401 });
    expect(row).not.toBeNull();
    await expect(svc.disable(USER, { code: recoveryCodes[0], password: 'Passw0rd!' })).resolves.toEqual({ enabled: false });
    expect(row).toBeNull();
    expect(mockLogSystem).toHaveBeenCalledWith(expect.anything(), 'TWO_FACTOR_DISABLED', 'user', USER.id, expect.anything());
  });

  it('Google: không cần mật khẩu khi tắt, requiresPasswordToDisable=false', async () => {
    creds.auth_provider = 'google';
    const { recoveryCodes } = await enableFor();
    expect((await svc.getStatus(USER.id)).requiresPasswordToDisable).toBe(false);
    await expect(svc.disable(USER, { code: recoveryCodes[0] })).resolves.toEqual({ enabled: false });
  });

  it('disable khi chưa bật → 400', async () => {
    await expect(svc.disable(USER, { code: '123456', password: 'Passw0rd!' })).rejects.toMatchObject({ status: 400 });
  });

  it('regenerateRecoveryCodes: thay toàn bộ bộ cũ; KHÔNG nhận mã khôi phục làm bằng chứng', async () => {
    const { secret, recoveryCodes } = await enableFor();
    await expect(svc.regenerateRecoveryCodes(USER.id, recoveryCodes[0])).rejects.toMatchObject({ status: 401 });
    const { recoveryCodes: fresh } = await svc.regenerateRecoveryCodes(USER.id, codeNow(secret, 1));
    expect(fresh).toHaveLength(8);
    expect(fresh).not.toEqual(recoveryCodes);
    await expect(svc.verifyCodeForUser(USER.id, recoveryCodes[1])).rejects.toMatchObject({ status: 401 });
    await expect(svc.verifyCodeForUser(USER.id, fresh[0])).resolves.toEqual({ method: 'recovery' });
  });

  it('getStatus: enabled / recoveryCodesLeft', async () => {
    expect(await svc.getStatus(USER.id)).toMatchObject({ enabled: false, recoveryCodesLeft: 0, requiresPasswordToDisable: true });
    await enableFor();
    expect(await svc.getStatus(USER.id)).toMatchObject({ enabled: true, recoveryCodesLeft: 8 });
  });
});

describe('challenge token', () => {
  it('ký đúng purpose + 5 phút; verify trả payload', () => {
    const token = svc.issueChallengeToken(USER, { method: 'local', rememberMe: false });
    const decoded = jwt.decode(token);
    expect(decoded).toMatchObject({ userId: 7, purpose: 'two_factor_challenge', method: 'local', rememberMe: false });
    expect(decoded.exp - decoded.iat).toBe(300);
    expect(svc.verifyChallengeToken(token)).toMatchObject({ userId: 7 });
  });

  it('access token thật (không có purpose) / purpose lạ / hết hạn / rác → 401 TWO_FACTOR_CODE_INVALID', () => {
    const sign = (payload, opts = {}) => jwt.sign(payload, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m', ...opts });
    for (const bad of [
      sign({ userId: 7, email: 'a@b.c', role: 'admin' }),
      sign({ userId: 7, purpose: 'other' }),
      sign({ userId: 7, purpose: 'two_factor_challenge' }, { expiresIn: '-10s' }),
      'khong.phai.jwt',
      jwt.sign({ userId: 7, purpose: 'two_factor_challenge' }, 'khoa-khac', { algorithm: 'HS256' }),
    ]) {
      expect(() => svc.verifyChallengeToken(bad)).toThrow(expect.objectContaining({ status: 401, code: 'TWO_FACTOR_CODE_INVALID' }));
    }
  });
});

describe('adminReset', () => {
  it('xoá dòng, trả hadTwoFactor, ghi audit TWO_FACTOR_RESET_BY_ADMIN kèm email', async () => {
    await enableFor();
    const out = await svc.adminReset(USER.id, { auditContext: { userId: 1 }, email: USER.email });
    expect(out).toEqual({ hadTwoFactor: true });
    expect(row).toBeNull();
    expect(mockLogSystem).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1 }), 'TWO_FACTOR_RESET_BY_ADMIN', 'user', USER.id,
      expect.objectContaining({ email: USER.email })
    );
    expect(await svc.adminReset(USER.id, { auditContext: { userId: 1 }, email: USER.email })).toEqual({ hadTwoFactor: false });
  });
});
