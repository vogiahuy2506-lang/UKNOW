import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const DOCKER_SOCKET = process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock';
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

const getDiskUsage = async () => {
  try {
    const { stdout } = await execFileAsync('df', ['-kP', '/'], { timeout: 3000 });
    const lines = stdout.trim().split('\n');
    const cols = lines[1]?.trim().split(/\s+/) || [];
    const total = bytes(cols[1]);
    const used = bytes(cols[2]);
    const available = bytes(cols[3]);
    return {
      filesystem: cols[0] || '/',
      mount: cols[5] || '/',
      total,
      used,
      available,
      percent: total > 0 ? pct((used / total) * 100) : 0,
    };
  } catch {
    return { filesystem: '/', mount: '/', total: 0, used: 0, available: 0, percent: 0 };
  }
};

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

const dockerRequest = async (path) => {
  try {
    await fs.access(DOCKER_SOCKET);
  } catch {
    const err = new Error('Docker socket is not mounted');
    err.code = 'DOCKER_UNAVAILABLE';
    throw err;
  }

  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath: DOCKER_SOCKET, path, method: 'GET' }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (res.statusCode >= 400) {
          const err = new Error(buffer.toString('utf8') || `Docker API ${res.statusCode}`);
          err.statusCode = res.statusCode;
          reject(err);
          return;
        }
        resolve(buffer);
      });
    });
    req.on('error', reject);
    req.setTimeout(4000, () => req.destroy(new Error('Docker API timeout')));
    req.end();
  });
};

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
    const names = new Set(Object.values(CONTAINER_ALLOWLIST));
    return {
      available: true,
      containers: containers.map(normalizeContainer).filter((container) => names.has(container.name)),
    };
  } catch (err) {
    return {
      available: false,
      error: err.code === 'DOCKER_UNAVAILABLE' ? 'DOCKER_SOCKET_NOT_MOUNTED' : 'DOCKER_API_ERROR',
      containers: [],
    };
  }
};

const buildAlerts = ({ cpu, memory, disk, docker }) => {
  const alerts = [];
  if (cpu.percent >= 90) alerts.push({ level: 'critical', code: 'CPU_HIGH', message: 'CPU usage is above 90%' });
  else if (cpu.percent >= 75) alerts.push({ level: 'warning', code: 'CPU_WARNING', message: 'CPU usage is above 75%' });

  if (memory.percent >= 95) alerts.push({ level: 'critical', code: 'MEMORY_HIGH', message: 'Memory usage is above 95%' });
  else if (memory.percent >= 85) alerts.push({ level: 'warning', code: 'MEMORY_WARNING', message: 'Memory usage is above 85%' });

  if (disk.percent >= 90) alerts.push({ level: 'critical', code: 'DISK_HIGH', message: 'Disk usage is above 90%' });
  else if (disk.percent >= 80) alerts.push({ level: 'warning', code: 'DISK_WARNING', message: 'Disk usage is above 80%' });

  docker.containers.forEach((container) => {
    if (container.state !== 'running') {
      alerts.push({ level: 'critical', code: 'CONTAINER_DOWN', message: `${container.name} is ${container.state}` });
    }
  });

  return alerts;
};

export async function getSystemOverview() {
  const [cpu, memory, disk, network, docker] = await Promise.all([
    getCpuUsage(),
    readText('/proc/meminfo').then(parseMeminfo),
    getDiskUsage(),
    getNetworkUsage(),
    getDockerContainers(),
  ]);

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
      error: err.code === 'DOCKER_UNAVAILABLE' ? 'DOCKER_SOCKET_NOT_MOUNTED' : 'DOCKER_API_ERROR',
      lines: [],
    };
  }
}
