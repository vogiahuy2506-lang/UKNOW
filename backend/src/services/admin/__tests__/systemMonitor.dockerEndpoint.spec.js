import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// Không để unit test chạm DB/Redis thật khi import service.
jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { pool: { options: { max: 20 }, totalCount: 0, idleCount: 0, waitingCount: 0 } },
}));
jest.unstable_mockModule('../../queue/outboundMessageQueue.service.js', () => ({
  default: {
    getRedisStats: jest.fn().mockResolvedValue({ available: false }),
    getQueueMetrics: jest.fn().mockResolvedValue(null),
  },
}));
jest.unstable_mockModule('../../../middleware/domainResolver.js', () => ({
  getDomainResolverCacheStats: jest.fn(() => ({})),
}));
jest.unstable_mockModule('../../../utils/storageCapacity.util.js', () => ({
  getStorageCapacityPolicy: jest.fn(() => ({ warningPercent: 80, criticalPercent: 90 })),
  getStorageCapacityState: jest.fn(() => 'ok'),
  getStorageCapacitySummary: jest.fn().mockResolvedValue({ readable: true }),
  getStoragePaths: jest.fn(() => ({})),
}));

const { resolveDockerEndpoint, dockerRequest, getSystemLogs } = await import('../systemMonitor.service.js');

/** Khung log đa luồng của Docker: 1 byte stream + 3 byte 0 + 4 byte độ dài big-endian. */
const dockerFrame = (text, stream = 1) => {
  const payload = Buffer.from(text, 'utf8');
  const header = Buffer.alloc(8);
  header[0] = stream;
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
};

const listen = (server, target) => new Promise((resolve) => {
  if (target) server.listen(target, resolve);
  else server.listen(0, resolve);
});
const close = (server) => new Promise((resolve) => server.close(() => resolve()));

const ENV_KEYS = ['DOCKER_HOST', 'DOCKER_SOCKET_PATH'];
let savedEnv;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  ENV_KEYS.forEach((key) => { delete process.env[key]; });
});

afterEach(() => {
  ENV_KEYS.forEach((key) => {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  });
});

describe('resolveDockerEndpoint', () => {
  it('falls back to the default unix socket when nothing is configured', () => {
    expect(resolveDockerEndpoint({})).toEqual({ type: 'socket', socketPath: '/var/run/docker.sock' });
  });

  it('keeps honouring DOCKER_SOCKET_PATH when DOCKER_HOST is unset or blank', () => {
    expect(resolveDockerEndpoint({ DOCKER_SOCKET_PATH: '/custom/docker.sock' }))
      .toEqual({ type: 'socket', socketPath: '/custom/docker.sock' });
    expect(resolveDockerEndpoint({ DOCKER_HOST: '   ', DOCKER_SOCKET_PATH: '/custom/docker.sock' }))
      .toEqual({ type: 'socket', socketPath: '/custom/docker.sock' });
  });

  it('maps DOCKER_HOST=unix:// to a socket path (takes precedence over DOCKER_SOCKET_PATH)', () => {
    expect(resolveDockerEndpoint({
      DOCKER_HOST: 'unix:///var/run/uknow-docker-proxy/docker.sock',
      DOCKER_SOCKET_PATH: '/var/run/docker.sock',
    })).toEqual({ type: 'socket', socketPath: '/var/run/uknow-docker-proxy/docker.sock' });
  });

  it('maps DOCKER_HOST=tcp://host:port to plain HTTP host/port', () => {
    expect(resolveDockerEndpoint({ DOCKER_HOST: 'tcp://uknow-docker-proxy:2375' }))
      .toEqual({ type: 'tcp', host: 'uknow-docker-proxy', port: 2375 });
    expect(resolveDockerEndpoint({ DOCKER_HOST: 'tcp://10.0.0.5' }))
      .toEqual({ type: 'tcp', host: '10.0.0.5', port: 2375 });
    expect(resolveDockerEndpoint({ DOCKER_HOST: 'http://127.0.0.1:12345' }))
      .toEqual({ type: 'tcp', host: '127.0.0.1', port: 12345 });
    expect(resolveDockerEndpoint({ DOCKER_HOST: 'tcp://[::1]:2375' }))
      .toEqual({ type: 'tcp', host: '::1', port: 2375 });
  });

  it('rejects unsupported or malformed DOCKER_HOST values instead of guessing', () => {
    ['ssh://root@vps', 'npipe:////./pipe/docker_engine', 'unix://relative.sock', 'tcp://', 'garbage', 'https://proxy:2376']
      .forEach((value) => {
        expect(resolveDockerEndpoint({ DOCKER_HOST: value }).type).toBe('invalid');
      });
  });
});

describe('dockerRequest / getSystemLogs over the configured endpoint', () => {
  it('reads container logs through a tcp:// endpoint', async () => {
    const seen = [];
    const server = http.createServer((req, res) => {
      seen.push(`${req.method} ${req.url}`);
      res.writeHead(200, { 'Content-Type': 'application/vnd.docker.raw-stream' });
      res.end(Buffer.concat([dockerFrame('line one\n'), dockerFrame('password=hunter2 line two\n', 2)]));
    });
    await listen(server);
    try {
      process.env.DOCKER_HOST = `tcp://127.0.0.1:${server.address().port}`;
      const result = await getSystemLogs('backend', 50);
      expect(result.available).toBe(true);
      expect(result.lines).toEqual(['line one', 'password=[masked] line two']);
      expect(seen).toEqual([
        'GET /containers/uknow-campaign-backend/logs?stdout=1&stderr=1&timestamps=1&tail=50',
      ]);
    } finally {
      await close(server);
    }
  });

  it('reads through a unix:// endpoint', async () => {
    let socketPath = path.join(os.tmpdir(), `uknow-sm-${process.pid}-${Date.now()}.sock`);
    if (socketPath.length > 100) socketPath = `/tmp/uknow-sm-${process.pid}-${Date.now()}.sock`;
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{ ok: true, path: req.url }]));
    });
    await listen(server, socketPath);
    try {
      const body = await dockerRequest('/containers/json?all=1', {
        env: { DOCKER_HOST: `unix://${socketPath}` },
      });
      expect(JSON.parse(body.toString('utf8'))).toEqual([{ ok: true, path: '/containers/json?all=1' }]);
    } finally {
      await close(server);
      fs.rmSync(socketPath, { force: true });
    }
  });

  it('reports DOCKER_SOCKET_NOT_MOUNTED (without throwing) when the socket does not exist', async () => {
    process.env.DOCKER_SOCKET_PATH = path.join(os.tmpdir(), 'uknow-definitely-missing', 'docker.sock');
    await expect(getSystemLogs('frontend', 20)).resolves.toEqual({
      available: false,
      service: 'frontend',
      container: 'uknow-campaign-frontend',
      error: 'DOCKER_SOCKET_NOT_MOUNTED',
      lines: [],
    });
  });

  it('reports DOCKER_SOCKET_NOT_MOUNTED for an unsupported DOCKER_HOST', async () => {
    process.env.DOCKER_HOST = 'ssh://root@example.com';
    const result = await getSystemLogs('backend', 20);
    expect(result.available).toBe(false);
    expect(result.error).toBe('DOCKER_SOCKET_NOT_MOUNTED');
  });

  it('reports DOCKER_API_ERROR when the proxy refuses the connection', async () => {
    const server = http.createServer();
    await listen(server);
    const { port } = server.address();
    await close(server);
    process.env.DOCKER_HOST = `tcp://127.0.0.1:${port}`;
    const result = await getSystemLogs('backend', 20);
    expect(result.available).toBe(false);
    expect(result.error).toBe('DOCKER_API_ERROR');
  });

  it('reports DOCKER_API_ERROR when the proxy denies the request (403)', async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(403, { 'Content-Type': 'text/html' });
      res.end('<html><body><h1>403 Forbidden</h1></body></html>');
    });
    await listen(server);
    try {
      process.env.DOCKER_HOST = `tcp://127.0.0.1:${server.address().port}`;
      const result = await getSystemLogs('backend', 20);
      expect(result).toEqual(expect.objectContaining({ available: false, error: 'DOCKER_API_ERROR', lines: [] }));
    } finally {
      await close(server);
    }
  });

  it('gives up after the overall deadline when the endpoint never answers', async () => {
    const pending = [];
    const server = http.createServer((req, res) => { pending.push(res); });
    await listen(server);
    try {
      const started = Date.now();
      await expect(dockerRequest('/containers/json', {
        env: { DOCKER_HOST: `tcp://127.0.0.1:${server.address().port}` },
        timeoutMs: 150,
      })).rejects.toMatchObject({ code: 'DOCKER_TIMEOUT' });
      expect(Date.now() - started).toBeLessThan(3000);
    } finally {
      pending.forEach((res) => res.destroy());
      server.closeAllConnections?.();
      await close(server);
    }
  });

  it('gives up after the deadline when the body trickles and never finishes', async () => {
    const pending = [];
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write('[');
      pending.push(res);
    });
    await listen(server);
    try {
      await expect(dockerRequest('/containers/json', {
        env: { DOCKER_HOST: `tcp://127.0.0.1:${server.address().port}` },
        timeoutMs: 150,
      })).rejects.toMatchObject({ code: 'DOCKER_TIMEOUT' });
    } finally {
      pending.forEach((res) => res.destroy());
      server.closeAllConnections?.();
      await close(server);
    }
  });

  it('rejects oversized responses instead of buffering them', async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200);
      res.end(Buffer.alloc(4096, 'a'));
    });
    await listen(server);
    try {
      await expect(dockerRequest('/containers/json', {
        env: { DOCKER_HOST: `tcp://127.0.0.1:${server.address().port}` },
        maxBytes: 1024,
      })).rejects.toThrow('Docker API response too large');
    } finally {
      server.closeAllConnections?.();
      await close(server);
    }
  });
});
