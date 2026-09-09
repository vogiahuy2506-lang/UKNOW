/**
 * whatsappCredentials.service.js
 *
 * Decrypts the user's Meta App Secret at runtime and returns the credentials
 * the OAuth / Graph API flows need.
 *
 * Order of precedence for choosing a credential row:
 *   1. Explicit `appId` argument (caller-supplied, e.g. when user picked
 *      a non-default app from a list).
 *   2. The user's `is_default = true AND is_active = true` row.
 *   3. The user's most-recently-used active row.
 *   4. The server-level fallback from environment variables (so admins can
 *      still onboard before any user has registered their own app).
 *
 * The fallback path is gated on `ALLOW_ENV_FALLBACK_WHATSAPP=true` to make
 * the production behaviour explicit. If not set and no per-user row exists,
 * `resolveCredentials` returns `null` and the caller MUST surface a friendly
 * "Please add your Meta App credentials" error.
 */
import userWhatsAppCredentialsRepository from '../../repositories/chatbot/userWhatsAppCredentials.repository.js';
import { decryptSmtpSecret, encryptSmtpSecret } from '../../utils/smtpSecretCrypto.js';

function envFallbackCredentials() {
  if (String(process.env.ALLOW_ENV_FALLBACK_WHATSAPP || '').toLowerCase() !== 'true') {
    return null;
  }
  const appId = process.env.WHATSAPP_APP_ID || process.env.META_APP_ID || '';
  const appSecret = process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET || '';
  if (!appId || !appSecret) return null;
  return {
    source: 'env',
    id: null,
    appId,
    appSecret,
    webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || null,
  };
}

export async function resolveCredentials({ userId, appId } = {}) {
  if (userId) {
    const row = appId
      ? await userWhatsAppCredentialsRepository.findByAppId(userId, appId)
      : (await userWhatsAppCredentialsRepository.getDefault(userId))
        || (await userWhatsAppCredentialsRepository.findActiveForUser(userId));

    if (row && row.is_active) {
      return {
        source: 'user',
        id: row.id,
        appId: row.app_id,
        appSecret: decryptSmtpSecret(row.app_secret_encrypted),
        webhookVerifyToken: row.webhook_verify_token || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || null,
      };
    }
  }
  return envFallbackCredentials();
}

/**
 * Save (or replace) a user's Meta App credentials. Returns the public view
 * (NEVER the encrypted secret). `appSecret` is plaintext here — we encrypt
 * immediately before persisting.
 */
export async function upsertUserCredentials({
  userId,
  appId,
  appSecret,
  appName,
  webhookVerifyToken,
  makeDefault,
}) {
  if (!appId) throw new Error('appId là bắt buộc');
  if (!appSecret) throw new Error('appSecret là bắt buộc');
  const encrypted = encryptSmtpSecret(appSecret);
  // If a row for this (user, app_id) already exists, update it in-place.
  const existing = await userWhatsAppCredentialsRepository.findByAppId(userId, appId);
  if (existing) {
    const client = (await import('../../config/database.js')).default;
    await client.query(
      `UPDATE user_whatsapp_app_credentials
          SET app_secret_encrypted = $3,
              app_name = COALESCE($4, app_name),
              webhook_verify_token = COALESCE($5, webhook_verify_token),
              is_active = true,
              updated_at = NOW()
        WHERE id = $1 AND id_user = $2`,
      [existing.id, userId, encrypted, appName || null, webhookVerifyToken || null]
    );
    if (makeDefault) {
      await userWhatsAppCredentialsRepository.setDefault(existing.id, userId);
    }
    return userWhatsAppCredentialsRepository.findById(existing.id, userId);
  }
  return userWhatsAppCredentialsRepository.create({
    userId,
    appId,
    appSecretEncrypted: encrypted,
    appName,
    webhookVerifyToken,
    makeDefault: !!makeDefault,
  });
}

export async function listUserCredentials(userId) {
  return userWhatsAppCredentialsRepository.listByUser(userId);
}

export async function deleteUserCredential(id, userId) {
  return userWhatsAppCredentialsRepository.deleteById(id, userId);
}

export async function setDefaultCredential(id, userId) {
  return userWhatsAppCredentialsRepository.setDefault(id, userId);
}

export async function setActiveCredential(id, userId, isActive) {
  return userWhatsAppCredentialsRepository.setActive(id, userId, isActive);
}

export async function recordCredentialUse(id) {
  if (!id) return;
  await userWhatsAppCredentialsRepository.touchLastUsed(id);
}

export default {
  resolveCredentials,
  upsertUserCredentials,
  listUserCredentials,
  deleteUserCredential,
  setDefaultCredential,
  setActiveCredential,
  recordCredentialUse,
};
