import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import db from '../../config/database.js';
import outboundMessageQueueService from '../queue/outboundMessageQueue.service.js';
import { getDomainResolverCacheStats } from '../../middleware/domainResolver.js';
import {
  getStorageCapacityPolicy,
  getStorageCapacityState,
  getStorageCapacitySummary,
  getStoragePaths,
} from '../../utils/storageCapacity.util.js';


const DEFAULT_DOCKER_SOCKET = '/var/run/docker.sock';
const DEFAULT_DOCKER_TCP_PORT = 2375;
// Hạn chót cho CẢ một lượt gọi (kết nối + đọc hết body), không chỉ thời gian socket rảnh:
// trang admin không được treo theo một proxy/daemon trả lời nhỏ giọt.
const DOCKER_API_TIMEOUT_MS = 4000;
// Tail tối đa 500 dòng log nên vài MB là dư; chặn trần để một đích lạ không làm phình bộ nhớ.
const DOCKER_API_MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const CONTAINER_ALLOWLIST = {
  backend: process.env.SYSTEM_MONITOR_BACKEND_CONTAINER || 'uknow-campaign-backend',
  frontend: process.env.SYSTEM_MONITOR_FRONTEND_CONTAINER || 'uknow-campaign-frontend',
};

let lastNetworkSample = null;

const readText = async (path) => {
  try {
    return await fs.readFile(path, 'utf8');
  } catch {
    return '';
  }
};

const getHostUptime = async () => {
  try {
    return os.uptime();
  } catch {
    const uptimeText = await readText('/proc/uptime');
    const seconds = Number(uptimeText.split(/\s+/)[0]);
    return Number.isFinite(seconds) ? seconds : 0;
  }
};

const pct = (value) => Math.max(0, Math.min(100, Number(value || 0)));

const bytes = (kb) => Math.round(Number(kb || 0) * 1024);

const parseMeminfo = (text) => {
  const values = {};
  text.split('\n').forEach((line) => {
    const match = line.match(/^(\w+):\s+(\d+)/);
    if (match) values[match[1]] = Number(match[2]);
  });

  const total = bytes(values.MemTotal);
  const available = bytes(values.MemAvailable || values.MemFree);
  const used = Math.max(0, total - available);
  const swapTotal = bytes(values.SwapTotal);
  const swapFree = bytes(values.SwapFree);
  const swapUsed = Math.max(0, swapTotal - swapFree);

  return {
    total,
    used,
    available,
    percent: total > 0 ? pct((used / total) * 100) : 0,
    swapTotal,
    swapUsed,
    swapPercent: swapTotal > 0 ? pct((swapUsed / swapTotal) * 100) : 0,
  };
};

const parseCpuLine = (line) => {
  const parts = line.trim().split(/\s+/).slice(1).map(Number);
  const idle = (parts[3] || 0) + (parts[4] || 0);
  const total = parts.reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0);
  return { idle, total };
};

const readCpuTimes = async () => {
  const stat = await readText('/proc/stat');
  return parseCpuLine(stat.split('\n')[0] || '');
};

const getCpuUsage = async () => {
  const first = await readCpuTimes();
  await new Promise((resolve) => setTimeout(resolve, 180));
  const second = await readCpuTimes();
  const idleDelta = second.idle - first.idle;
  const totalDelta = second.total - first.total;
  const used = totalDelta > 0 ? (1 - idleDelta / totalDelta) * 100 : 0;
  return {
    percent: pct(used),
    cores: os.cpus()?.length || 0,
    loadAverage: os.loadavg(),
  };
};

const getDiskUsage = () => getStorageCapacitySummary(Object.values(getStoragePaths()));

const parseNetwork = (text) => {
  let rxBytes = 0;
  let txBytes = 0;
  text.split('\n').slice(2).forEach((line) => {
    const [ifaceRaw, restRaw] = line.split(':');
    const iface = String(ifaceRaw || '').trim();
    if (!iface || iface === 'lo') return;
    const fields = String(restRaw || '').trim().split(/\s+/).map(Number);
    rxBytes += fields[0] || 0;
    txBytes += fields[8] || 0;
  });
  return { rxBytes, txBytes };
};

const getNetworkUsage = async () => {
  const now = Date.now();
  const current = parseNetwork(await readText('/proc/net/dev'));
  let rxRate = 0;
  let txRate = 0;

  if (lastNetworkSample) {
    const seconds = Math.max(1, (now - lastNetworkSample.at) / 1000);
    rxRate = Math.max(0, (current.rxBytes - lastNetworkSample.rxBytes) / seconds);
    txRate = Math.max(0, (current.txBytes - lastNetworkSample.txBytes) / seconds);
  }

  lastNetworkSample = { ...current, at: now };
  return { ...current, rxRate, txRate };
};

const dockerUnavailable = (message) => {
  const err = new Error(message);
  err.code = 'DOCKER_UNAVAILABLE';
  return err;
};

/**
 * Chọn đích Docker Engine API theo đúng quy ước của Docker CLI:
 * - `DOCKER_HOST=unix:///duong/dan.sock` → unix socket (production: socket của proxy chỉ-đọc
 *   uknow-docker-proxy, KHÔNG phải /var/run/docker.sock của host).
 * - `DOCKER_HOST=tcp://host:port` (hoặc `http://`) → HTTP thường tới host:port (mặc định 2375).
 * - Không đặt DOCKER_HOST → `DOCKER_SOCKET_PATH` hoặc /var/run/docker.sock (hành vi cũ).
 * Scheme khác (ssh://, npipe://, https/TLS...) không hỗ trợ → `invalid`, trang admin báo "chưa nối".
 *
 * @param {Record<string, string|undefined>} [env]
 * @returns {{ type: 'socket', socketPath: string }
 *   | { type: 'tcp', host: string, port: number }
 *   | { type: 'invalid', reason: string }}
 */
export function resolveDockerEndpoint(env = process.env) {
  const dockerHost = String(env.DOCKER_HOST || '').trim();
  if (!dockerHost) {
    const socketPath = String(env.DOCKER_SOCKET_PATH || '').trim() || DEFAULT_DOCKER_SOCKET;
    return { type: 'socket', socketPath };
  }

  const unixMatch = dockerHost.match(/^unix:\/\/(\/.*)$/i);
  if (unixMatch) {
    return { type: 'socket', socketPath: unixMatch[1] };
  }

  const tcpMatch = dockerHost.match(/^(?:tcp|http):\/\/(.+)$/i);
  if (tcpMatch) {
    let parsed;
    try {
      parsed = new URL(`http://${tcpMatch[1]}`);
    } catch {
      return { type: 'invalid', reason: 'DOCKER_HOST is not a valid tcp:// address' };
    }
    const host = parsed.hostname.replace(/^\[(.*)\]$/, '$1');
    const port = parsed.port ? Number(parsed.port) : DEFAULT_DOCKER_TCP_PORT;
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
      return { type: 'invalid', reason: 'DOCKER_HOST is not a valid tcp:// address' };
    }
    return { type: 'tcp', host, port };
  }

  return { type: 'invalid', reason: 'DOCKER_HOST scheme is not supported (use unix:// or tcp://)' };
}

/**
 * GET một đường Docker Engine API. Chỉ GET: proxy production cũng chặn mọi phương thức khác.
 * Mọi lỗi đều reject; nơi gọi đổi thành kết quả `available: false`, không bao giờ ném lên route.
 *
 * @param {string} path
 * @param {{ env?: Record<string, string|undefined>, timeoutMs?: number, maxBytes?: number }} [options]
 * @returns {Promise<Buffer>}
 */
export const dockerRequest = async (path, {
  env = process.env,
  timeoutMs = DOCKER_API_TIMEOUT_MS,
  maxBytes = DOCKER_API_MAX_RESPONSE_BYTES,
} = {}) => {
  const endpoint = resolveDockerEndpoint(env);
  if (endpoint.type === 'invalid') {
    throw dockerUnavailable(endpoint.reason);
  }

  if (endpoint.type === 'socket') {
    try {
      await fs.access(endpoint.socketPath);
    } catch {
      throw dockerUnavailable('Docker socket is not mounted');
    }
  }

  const target = endpoint.type === 'socket'
    ? { socketPath: endpoint.socketPath }
    : { host: endpoint.host, port: endpoint.port };

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    // agent: false — mỗi lượt một kết nối riêng, không giữ socket keep-alive tới Docker API.
    // Hủy kết nối KHÔNG kèm đối tượng lỗi: promise đã được chốt bằng lỗi của mình rồi, truyền
    // lỗi vào destroy() chỉ sinh thêm sự kiện 'error' trên socket mà không ai nghe.
    const req = http.request({ ...target, path, method: 'GET', agent: false }, (res) => {
      const chunks = [];
      let received = 0;
      res.on('data', (chunk) => {
        if (settled) return;
        received += chunk.length;
        if (received > maxBytes) {
          finish(reject, new Error('Docker API response too large'));
          res.destroy();
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (res.statusCode >= 400) {
          const err = new Error(buffer.toString('utf8').slice(0, 500) || `Docker API ${res.statusCode}`);
          err.statusCode = res.statusCode;
          finish(reject, err);
          return;
        }
        finish(resolve, buffer);
      });
      res.on('error', (err) => finish(reject, err));
      res.on('close', () => {
        if (!res.complete) finish(reject, new Error('Docker API connection closed early'));
      });
    });

    timer = setTimeout(() => {
      const err = new Error('Docker API timeout');
      err.code = 'DOCKER_TIMEOUT';
      finish(reject, err);
      req.destroy();
    }, timeoutMs);

    req.on('error', (err) => finish(reject, err));
    req.end();
  });
};

const dockerErrorCode = (err) => (
  err?.code === 'DOCKER_UNAVAILABLE' ? 'DOCKER_SOCKET_NOT_MOUNTED' : 'DOCKER_API_ERROR'
);

const normalizeContainer = (container) => ({
  id: container.Id,
  name: String(container.Names?.[0] || '').replace(/^\//, ''),
  image: container.Image,
  state: container.State,
  status: container.Status,
  created: container.Created ? new Date(container.Created * 1000).toISOString() : null,
  labels: container.Labels || {},
});

const stripDockerFrames = (buffer) => {
  const chunks = [];
  let offset = 0;

  while (offset + 8 <= buffer.length) {
    const streamType = buffer[offset];
    const size = buffer.readUInt32BE(offset + 4);
    const looksFramed = [0, 1, 2].includes(streamType) && size >= 0 && offset + 8 + size <= buffer.length;
    if (!looksFramed) break;
    chunks.push(buffer.subarray(offset + 8, offset + 8 + size));
    offset += 8 + size;
  }

  if (chunks.length === 0) return buffer.toString('utf8');
  if (offset < buffer.length) chunks.push(buffer.subarray(offset));
  return Buffer.concat(chunks).toString('utf8');
};

const maskSensitive = (text) => String(text || '')
  .replace(/(authorization:\s*bearer\s+)[^\s]+/gi, '$1[masked]')
  .replace(/((?:password|token|secret|api[_-]?key|checksum[_-]?key)\s*[:=]\s*)[^\s,;]+/gi, '$1[masked]')
  .replace(/(eyJ[a-zA-Z0-9_-]{12,}\.[a-zA-Z0-9_-]{12,}\.[a-zA-Z0-9_-]{12,})/g, '[jwt-masked]');

const getDockerContainers = async () => {
  try {
    const buffer = await dockerRequest('/containers/json?all=1');
    const containers = JSON.parse(buffer.toString('utf8'));
    if (!Array.isArray(containers)) throw new Error('Unexpected Docker API response');
    const names = new Set(Object.values(CONTAINER_ALLOWLIST));
    return {
      available: true,
      containers: containers.map(normalizeContainer).filter((container) => names.has(container.name)),
    };
  } catch (err) {
    return {
      available: false,
      error: dockerErrorCode(err),
      containers: [],
    };
  }
};

const getDbPoolStats = () => {
  try {
    const pool = db.pool;
    const max = pool.options?.max ?? 20;
    const total = pool.totalCount ?? 0;
    const idle = pool.idleCount ?? 0;
    const waiting = pool.waitingCount ?? 0;
    return { available: true, total, idle, waiting, max, percent: max > 0 ? pct((total / max) * 100) : 0 };
  } catch {
    return { available: false, total: 0, idle: 0, waiting: 0, max: 0, percent: 0 };
  }
};

const buildAlerts = ({ cpu, memory, disk, docker, redis, dbPool }) => {
  const alerts = [];
  if (cpu.percent >= 90) alerts.push({ level: 'critical', code: 'CPU_HIGH', message: 'CPU usage is above 90%' });
  else if (cpu.percent >= 75) alerts.push({ level: 'warning', code: 'CPU_WARNING', message: 'CPU usage is above 75%' });

  if (memory.percent >= 95) alerts.push({ level: 'critical', code: 'MEMORY_HIGH', message: 'Memory usage is above 95%' });
  else if (memory.percent >= 85) alerts.push({ level: 'warning', code: 'MEMORY_WARNING', message: 'Memory usage is above 85%' });

  if (!disk.readable) {
    alerts.push({ level: 'critical', code: 'DISK_UNAVAILABLE', message: 'Storage capacity cannot be read; local uploads are blocked' });
  } else {
    const diskPolicy = getStorageCapacityPolicy();
    const diskState = getStorageCapacityState(disk);
    if (diskState === 'critical') {
      alerts.push({ level: 'critical', code: 'DISK_HIGH', message: `Disk usage is above ${diskPolicy.criticalPercent}%` });
    } else if (diskState === 'warning' || diskState === 'blocked') {
      alerts.push({ level: 'warning', code: 'DISK_WARNING', message: `Disk usage is above ${diskPolicy.warningPercent}%` });
    }
  }

  docker.containers.forEach((container) => {
    if (container.state !== 'running') {
      alerts.push({ level: 'critical', code: 'CONTAINER_DOWN', message: `${container.name} is ${container.state}` });
    }
  });

  if (redis?.available && !redis.evictionPolicyOk) {
    alerts.push({ level: 'warning', code: 'REDIS_EVICTION_POLICY', message: `Redis eviction policy is "${redis.evictionPolicy}" — BullMQ requires "noeviction"` });
  }

  if (dbPool?.available && dbPool.max > 0) {
    const poolPct = (dbPool.total / dbPool.max) * 100;
    if (poolPct >= 90) alerts.push({ level: 'critical', code: 'DB_POOL_HIGH', message: `DB pool ${dbPool.total}/${dbPool.max} connections` });
    else if (poolPct >= 75) alerts.push({ level: 'warning', code: 'DB_POOL_WARNING', message: `DB pool ${dbPool.total}/${dbPool.max} connections` });
  }

  return alerts;
};

export async function getSystemOverview() {
  const [cpu, memory, disk, network, docker, redis, bullmq] = await Promise.all([
    getCpuUsage(),
    readText('/proc/meminfo').then(parseMeminfo),
    getDiskUsage(),
    getNetworkUsage(),
    getDockerContainers(),
    outboundMessageQueueService.getRedisStats(),
    outboundMessageQueueService.getQueueMetrics(),
  ]);

  const dbPool = getDbPoolStats();

  const data = {
    host: {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      uptime: await getHostUptime(),
      checkedAt: new Date().toISOString(),
    },
    process: {
      pid: process.pid,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      nodeVersion: process.version,
    },
    cpu,
    memory,
    disk,
    network,
    docker,
    redis,
    bullmq: bullmq ?? { available: false },
    dbPool,
    caches: {
      domainResolver: getDomainResolverCacheStats(),
    },
  };

  return { ...data, alerts: buildAlerts(data) };
}


export async function getSystemLogs(service = 'backend', tail = 200) {
  const normalizedService = String(service || 'backend').trim().toLowerCase();
  const containerName = CONTAINER_ALLOWLIST[normalizedService];
  if (!containerName) {
    throw { status: 400, message: 'Unknown service' };
  }

  const safeTail = Math.min(500, Math.max(20, Number(tail || 200)));
  try {
    const buffer = await dockerRequest(`/containers/${encodeURIComponent(containerName)}/logs?stdout=1&stderr=1&timestamps=1&tail=${safeTail}`);
    const text = maskSensitive(stripDockerFrames(buffer));
    return {
      available: true,
      service: normalizedService,
      container: containerName,
      lines: text.split('\n').filter(Boolean),
    };
  } catch (err) {
    return {
      available: false,
      service: normalizedService,
      container: containerName,
      error: dockerErrorCode(err),
      lines: [],
    };
  }
}
