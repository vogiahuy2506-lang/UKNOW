import db from '../../config/database.js';
import { getEffectiveQuota, getWorkspaceUsage } from '../../repositories/storage.repository.js';

export const DEFAULT_STORAGE_LIMIT_BYTES = 100 * 1024 * 1024;

export class StorageQuotaExceededError extends Error {
  constructor(usage) {
    super('Workspace đã dùng hết dung lượng lưu trữ');
    this.name = 'StorageQuotaExceededError';
    this.code = 'STORAGE_QUOTA_EXCEEDED';
    this.status = 409;
    this.usage = usage;
  }
}

function toSafeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : fallback;
}

export function isStorageQuotaEnforcementEnabled() {
  return String(process.env.STORAGE_QUOTA_ENFORCEMENT_ENABLED || '').toLowerCase() === 'true';
}

export function resolveWorkspaceOwnerId(user) {
  const ownerId = user?.activeContext?.type === 'employee'
    ? user.activeContext.ownerId
    : user?.id;
  const parsed = Number(ownerId);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error('Không xác định được workspace owner');
  }
  return parsed;
}

export async function getStorageUsage(ownerUserId, queryable = db) {
  // A pg client queues queries anyway. Keep this sequential when called inside
  // the quota transaction so the lock/read ordering is explicit.
  const quota = await getEffectiveQuota(ownerUserId, queryable);
  const usedValue = await getWorkspaceUsage(ownerUserId, queryable);
  const overrideBytes = toSafeNumber(quota?.overrideBytes, 0);
  const planLimitBytes = toSafeNumber(quota?.planLimitBytes, DEFAULT_STORAGE_LIMIT_BYTES);
  const limitBytes = overrideBytes || planLimitBytes || DEFAULT_STORAGE_LIMIT_BYTES;
  const usedBytes = toSafeNumber(usedValue, 0);
  const remainingBytes = Math.max(0, limitBytes - usedBytes);
  return {
    usedBytes,
    reservedBytes: 0,
    limitBytes,
    remainingBytes,
    percent: limitBytes ? Math.round((usedBytes / limitBytes) * 100) : 100,
    overLimit: usedBytes > limitBytes,
    source: overrideBytes ? 'override' : 'plan',
  };
}

export function assertQuotaAvailable({ usage, requestedBytes }) {
  if (!isStorageQuotaEnforcementEnabled()) return;
  if (usage.usedBytes + requestedBytes > usage.limitBytes) {
    throw new StorageQuotaExceededError(usage);
  }
}
