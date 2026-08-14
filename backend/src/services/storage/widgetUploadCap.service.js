import crypto from 'crypto';
import IORedis from 'ioredis';
import { vnDayKey } from '../../utils/vnTimeFormat.util.js';

const LUA_CHECK_AND_INCREMENT = `
local ipCurrent = tonumber(redis.call('GET', KEYS[1]) or '0')
local botCurrent = tonumber(redis.call('GET', KEYS[2]) or '0')
local bytes = tonumber(ARGV[1])
if ipCurrent + bytes > tonumber(ARGV[2]) or botCurrent + bytes > tonumber(ARGV[3]) then
  return {0, ipCurrent, botCurrent}
end
local ipValue = redis.call('INCRBY', KEYS[1], bytes)
local botValue = redis.call('INCRBY', KEYS[2], bytes)
if ipCurrent == 0 then redis.call('EXPIRE', KEYS[1], ARGV[4]) end
if botCurrent == 0 then redis.call('EXPIRE', KEYS[2], ARGV[4]) end
return {1, ipValue, botValue}
`;

let redis;
let connecting;

function isEnabled() {
  return String(process.env.STORAGE_WIDGET_CAP_ENABLED || '').toLowerCase() === 'true';
}

function positiveEnv(name) {
  const value = Number(process.env[name]);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Thiếu ${name}`);
  return value;
}

function redisConfig() {
  const url = String(process.env.BULLMQ_REDIS_URL || process.env.REDIS_URL || '').trim();
  if (url) return url;
  return {
    host: String(process.env.REDIS_HOST || '127.0.0.1'),
    port: Number(process.env.REDIS_PORT || 6379),
    db: Number(process.env.REDIS_DB || 0),
    ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
  };
}

async function getRedis() {
  if (redis) return redis;
  if (connecting) return connecting;
  connecting = (async () => {
    const client = new IORedis(redisConfig(), {
      lazyConnect: true,
      connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 5000),
      maxRetriesPerRequest: 1,
    });
    try {
      await client.connect();
      redis = client;
      return client;
    } catch (error) {
      client.disconnect();
      throw error;
    } finally {
      connecting = null;
    }
  })();
  return connecting;
}

function secondsToNextVietnamMidnight(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type) => Number(parts.find((item) => item.type === type)?.value);
  const nextMidnightUtc = Date.UTC(part('year'), part('month') - 1, part('day') + 1, 0, 0, 0) - (7 * 60 * 60 * 1000);
  return Math.max(1, Math.ceil((nextMidnightUtc - now.getTime()) / 1000));
}

export class WidgetUploadCapError extends Error {
  constructor() {
    super('Tạm thời không thể gửi tệp');
    this.code = 'WIDGET_UPLOAD_CAP_EXCEEDED';
    this.status = 429;
  }
}

export async function consumeWidgetUploadBytes({ ip, chatbotId, bytes }) {
  if (!isEnabled()) return;
  const actualBytes = Number(bytes);
  if (!Number.isSafeInteger(actualBytes) || actualBytes <= 0) throw new WidgetUploadCapError();
  const ipLimit = positiveEnv('STORAGE_WIDGET_BYTES_PER_IP_PER_DAY');
  const chatbotLimit = positiveEnv('STORAGE_WIDGET_BYTES_PER_CHATBOT_PER_DAY');
  const ipHash = crypto.createHash('sha256').update(String(ip || 'unknown')).digest('hex');
  const day = vnDayKey();
  let result;
  try {
    result = await (await getRedis()).eval(
      LUA_CHECK_AND_INCREMENT,
      2,
      `storage:widget:ip:${ipHash}:${day}`,
      `storage:widget:chatbot:${chatbotId}:${day}`,
      actualBytes,
      ipLimit,
      chatbotLimit,
      secondsToNextVietnamMidnight()
    );
  } catch (error) {
    const unavailable = new Error('Tạm thời không thể gửi tệp');
    unavailable.code = 'WIDGET_UPLOAD_CAP_UNAVAILABLE';
    unavailable.status = 503;
    throw unavailable;
  }
  if (Number(result?.[0]) !== 1) throw new WidgetUploadCapError();
}
