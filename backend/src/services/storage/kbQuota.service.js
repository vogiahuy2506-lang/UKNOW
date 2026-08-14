import db from '../../config/database.js';
import {
  acquireKbQuotaLock,
  countInvalidActivePlanKbLimits,
  getEffectiveKbLimits,
  getKbUsage,
} from '../../repositories/kbQuota.repository.js';

export const DEFAULT_KB_LIMITS = Object.freeze({
  maxDocuments: 3,
  maxExtractedChars: 100000,
});

export class KbQuotaExceededError extends Error {
  constructor(resource, usage) {
    const isDocuments = resource === 'kb_documents';
    super(isDocuments
      ? 'Workspace đã đạt giới hạn số tài liệu kiến thức'
      : 'Workspace đã đạt giới hạn nội dung kiến thức');
    this.name = 'KbQuotaExceededError';
    this.code = isDocuments ? 'KB_DOCUMENT_LIMIT_EXCEEDED' : 'KB_CHAR_LIMIT_EXCEEDED';
    this.resource = resource;
    this.status = 409;
    this.used = isDocuments ? usage.documentCount : usage.extractedChars;
    this.limit = isDocuments ? usage.maxDocuments : usage.maxExtractedChars;
  }
}

function safeNonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
}

export function countExtractedChars(text) {
  return Array.from(String(text || '')).length;
}

export function isKbLimitEnforcementEnabled() {
  return String(process.env.STORAGE_KB_LIMIT_ENABLED || '').toLowerCase() === 'true';
}

export async function getWorkspaceKbUsage(ownerUserId, queryable = db) {
  const limits = await getEffectiveKbLimits(ownerUserId, queryable);
  const usage = await getKbUsage(ownerUserId, queryable);
  return {
    documentCount: safeNonNegativeInteger(usage.documentCount),
    extractedChars: safeNonNegativeInteger(usage.extractedChars),
    maxDocuments: safeNonNegativeInteger(limits?.maxDocuments, DEFAULT_KB_LIMITS.maxDocuments),
    maxExtractedChars: safeNonNegativeInteger(
      limits?.maxExtractedChars,
      DEFAULT_KB_LIMITS.maxExtractedChars
    ),
  };
}

export function assertKbQuotaDelta(usage, { documentDelta = 0, charDelta = 0 } = {}) {
  if (!isKbLimitEnforcementEnabled()) return;
  if (documentDelta > 0 && usage.documentCount + documentDelta > usage.maxDocuments) {
    throw new KbQuotaExceededError('kb_documents', usage);
  }
  if (charDelta > 0 && usage.extractedChars + charDelta > usage.maxExtractedChars) {
    throw new KbQuotaExceededError('kb_extracted_chars', usage);
  }
}

export async function withKbQuotaLock(ownerUserId, mutation) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await acquireKbQuotaLock(client, ownerUserId);
    const usage = await getWorkspaceKbUsage(ownerUserId, client);
    const result = await mutation({
      client,
      usage,
      assertDelta: (delta) => assertKbQuotaDelta(usage, delta),
    });
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function validateActivePlanKbLimits(queryable = db) {
  if (!isKbLimitEnforcementEnabled()) return { enabled: false, invalidPlanCount: 0 };
  const invalidPlanCount = await countInvalidActivePlanKbLimits(queryable);
  if (invalidPlanCount > 0) {
    throw new Error(
      `STORAGE_KB_LIMIT_ENABLED requires positive KB limits on every active plan (${invalidPlanCount} invalid)`
    );
  }
  return { enabled: true, invalidPlanCount: 0 };
}
