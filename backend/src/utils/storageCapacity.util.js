import path from 'node:path';
import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const STORAGE_POOL_TYPES = Object.freeze({
  WORKSPACE: 'workspace',
  SYSTEM: 'system',
});

const DEFAULT_POLICY = Object.freeze({
  warningPercent: 70,
  workspaceBlockPercent: 80,
  systemBlockPercent: 85,
  criticalPercent: 90,
  cacheMs: 20_000,
});

const capacityCache = new Map();
let diskStatsReader = readDiskStatsFromDf;

const asPercent = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 100) return fallback;
  return parsed;
};

const asCacheMs = (value) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_POLICY.cacheMs;
  return Math.min(60_000, Math.max(1_000, parsed));
};

const toBytes = (kilobytes) => Math.round(Number(kilobytes || 0) * 1024);

export function getStoragePaths() {
  return Object.freeze({
    uploads: path.resolve(process.cwd(), 'uploads'),
    tempUploads: path.resolve(process.cwd(), 'temp_uploads'),
  });
}

export function getStorageCapacityPolicy() {
  const warningPercent = asPercent(
    process.env.STORAGE_DISK_WARNING_PERCENT,
    DEFAULT_POLICY.warningPercent,
  );
  const workspaceBlockPercent = Math.max(
    warningPercent,
    asPercent(process.env.STORAGE_DISK_USER_BLOCK_PERCENT, DEFAULT_POLICY.workspaceBlockPercent),
  );
  const systemBlockPercent = Math.max(
    workspaceBlockPercent,
    asPercent(process.env.STORAGE_DISK_SYSTEM_BLOCK_PERCENT, DEFAULT_POLICY.systemBlockPercent),
  );
  const criticalPercent = Math.max(
    systemBlockPercent,
    asPercent(process.env.STORAGE_DISK_CRITICAL_PERCENT, DEFAULT_POLICY.criticalPercent),
  );

  return {
    warningPercent,
    workspaceBlockPercent,
    systemBlockPercent,
    criticalPercent,
    cacheMs: asCacheMs(process.env.STORAGE_DISK_STATS_CACHE_MS),
  };
}

async function findExistingPath(targetPath) {
  let candidate = path.resolve(targetPath);
  while (true) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      const parent = path.dirname(candidate);
      if (parent === candidate) return candidate;
      candidate = parent;
    }
  }
}

async function readDiskStatsFromDf(targetPath) {
  const existingPath = await findExistingPath(targetPath);
  const { stdout } = await execFileAsync('df', ['-kP', existingPath], { timeout: 3_000 });
  const line = stdout.trim().split('\n').at(-1) || '';
  const cols = line.trim().split(/\s+/);
  const total = toBytes(cols[1]);
  const used = toBytes(cols[2]);
  const available = toBytes(cols[3]);

  if (!total || !Number.isFinite(used) || !Number.isFinite(available)) {
    throw new Error('Invalid df output');
  }

  return {
    filesystem: cols[0] || '',
    mount: cols[5] || '',
    total,
    used,
    available,
    percent: Math.max(0, Math.min(100, (used / total) * 100)),
  };
}

export async function getStorageCapacityForPath(targetPath, { forceRefresh = false } = {}) {
  const cacheKey = path.resolve(targetPath);
  const policy = getStorageCapacityPolicy();
  const cached = capacityCache.get(cacheKey);
  const now = Date.now();

  if (!forceRefresh && cached && now - cached.checkedAt < policy.cacheMs) {
    return cached.snapshot;
  }

  try {
    const snapshot = await diskStatsReader(cacheKey);
    const normalized = {
      ...snapshot,
      path: cacheKey,
      percent: Math.max(0, Math.min(100, Number(snapshot.percent || 0))),
      checkedAt: new Date(now).toISOString(),
    };
    capacityCache.set(cacheKey, { snapshot: normalized, checkedAt: now });
    return normalized;
  } catch (error) {
    const unavailable = new Error('Storage capacity is unavailable');
    unavailable.code = 'STORAGE_CAPACITY_UNKNOWN';
    unavailable.cause = error;
    throw unavailable;
  }
}

export async function getStorageCapacitySummary(paths = Object.values(getStoragePaths())) {
  const uniquePaths = [...new Set(paths.map((item) => path.resolve(item)))];
  const results = await Promise.allSettled(uniquePaths.map((item) => getStorageCapacityForPath(item)));
  const snapshots = results
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);
  const unavailablePaths = results
    .map((result, index) => (result.status === 'rejected' ? uniquePaths[index] : null))
    .filter(Boolean);
  const worst = snapshots.reduce((current, snapshot) => (
    !current || snapshot.percent > current.percent ? snapshot : current
  ), null);

  return {
    readable: unavailablePaths.length === 0,
    unavailablePaths,
    ...(worst || {
      filesystem: '',
      mount: '',
      total: 0,
      used: 0,
      available: 0,
      percent: 0,
      checkedAt: null,
    }),
    paths: snapshots,
  };
}

export function getStorageCapacityState(snapshot, poolType = STORAGE_POOL_TYPES.WORKSPACE) {
  const policy = getStorageCapacityPolicy();
  const percent = Number(snapshot?.percent || 0);
  const blockPercent = poolType === STORAGE_POOL_TYPES.SYSTEM
    ? policy.systemBlockPercent
    : policy.workspaceBlockPercent;

  if (percent >= policy.criticalPercent) return 'critical';
  if (percent >= blockPercent) return 'blocked';
  if (percent >= policy.warningPercent) return 'warning';
  return 'healthy';
}

export class StorageCapacityError extends Error {
  constructor(code) {
    super(code === 'STORAGE_CAPACITY_UNKNOWN'
      ? 'Hệ thống đang tạm thời không thể kiểm tra dung lượng lưu trữ.'
      : 'Hệ thống đang tạm ngừng nhận tệp mới để bảo vệ dữ liệu. Vui lòng thử lại sau.');
    this.name = 'StorageCapacityError';
    this.code = code;
    this.status = 503;
  }
}

export async function assertStorageCapacity({ paths, poolType = STORAGE_POOL_TYPES.WORKSPACE }) {
  const targets = Array.isArray(paths) ? paths : [paths];
  let snapshots;
  try {
    snapshots = await Promise.all(targets.map((target) => getStorageCapacityForPath(target)));
  } catch (error) {
    if (error?.code === 'STORAGE_CAPACITY_UNKNOWN') {
      throw new StorageCapacityError('STORAGE_CAPACITY_UNKNOWN');
    }
    throw error;
  }

  if (snapshots.some((snapshot) => getStorageCapacityState(snapshot, poolType) === 'blocked'
    || getStorageCapacityState(snapshot, poolType) === 'critical')) {
    throw new StorageCapacityError('STORAGE_CAPACITY_PROTECTED');
  }

  return snapshots;
}

export function __setStorageCapacityReaderForTests(reader) {
  diskStatsReader = reader;
  capacityCache.clear();
}

export function __resetStorageCapacityForTests() {
  diskStatsReader = readDiskStatsFromDf;
  capacityCache.clear();
}
