/**
 * W7a — quickSendAdapter.service: ước tính, cờ kênh, kiểm dữ liệu, và bảng chuẩn hoá SĐT WhatsApp ghim CÙNG bảng
 * input/output với FE (`parseWhatsAppPhoneList` ở nodeConfigModal.whatsapp.spec.js) để BE và FE không lệch nhau.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  estimateQuickSendAdapter,
  sendQuickAdapterMessage,
  listQuickSendConversations,
  isQuickSendAdapterChannel,
} from '../quickSendAdapter.service.js';
import { normalizeWhatsAppPhone } from '../channels/whatsapp.campaignChannel.js';

function clearEnv() {
  delete process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED;
  delete process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED;
  delete process.env.TELEGRAM_OUTBOUND_INTER_MESSAGE_MIN_MS;
  delete process.env.TELEGRAM_OUTBOUND_INTER_MESSAGE_MAX_MS;
  delete process.env.WHATSAPP_OUTBOUND_INTER_MESSAGE_MIN_MS;
  delete process.env.WHATSAPP_OUTBOUND_INTER_MESSAGE_MAX_MS;
}

beforeEach(clearEnv);
afterEach(clearEnv);

describe('isQuickSendAdapterChannel', () => {
  it('chỉ telegram / whatsapp', () => {
    expect(isQuickSendAdapterChannel('telegram')).toBe(true);
    expect(isQuickSendAdapterChannel('whatsapp')).toBe(true);
    expect(isQuickSendAdapterChannel('zalo')).toBe(false);
    expect(isQuickSendAdapterChannel('test-send')).toBe(false);
    expect(isQuickSendAdapterChannel('constructor')).toBe(false);
  });
});

describe('estimateQuickSendAdapter', () => {
  it('cờ Telegram tắt -> 409 CHANNEL_DISABLED', () => {
    expect(() => estimateQuickSendAdapter({ channel: 'telegram', recipients: 10 }))
      .toThrow(expect.objectContaining({ status: 409, code: 'CHANNEL_DISABLED' }));
  });

  it('Telegram 50 người = 49 x 7,5s = 367,5s (~7 phút làm tròn lên)', () => {
    process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED = 'true';
    const est = estimateQuickSendAdapter({ channel: 'telegram', recipients: 50 });
    expect(est.estimatedMs).toBe(367_500);
    expect(est.unit).toBe('minutes');
    expect(est.value).toBe(7);
  });

  it('Telegram 100 người = 99 x 7,5s = 742,5s', () => {
    process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED = 'true';
    expect(estimateQuickSendAdapter({ channel: 'telegram', recipients: 100 }).estimatedMs).toBe(742_500);
  });

  it('WhatsApp 50 người = 49 x 14s = 686s', () => {
    process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED = 'true';
    const est = estimateQuickSendAdapter({ channel: 'whatsapp', recipients: 50 });
    expect(est.estimatedMs).toBe(686_000);
    expect(est.unit).toBe('minutes');
    expect(est.value).toBe(12);
  });

  it('1 người -> immediate, không có quietHours bật', () => {
    process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED = 'true';
    const est = estimateQuickSendAdapter({ channel: 'whatsapp', recipients: 1 });
    expect(est.estimatedMs).toBe(0);
    expect(est.unit).toBe('immediate');
    expect(est.quietHours.startFormatted).toBe('23:00');
    expect(est.quietHours.endFormatted).toBe('06:00');
  });

  it('env đổi nhịp thì ước tính đổi theo (đọc policy runtime, không hằng số cứng)', () => {
    process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED = 'true';
    process.env.TELEGRAM_OUTBOUND_INTER_MESSAGE_MIN_MS = '1000';
    process.env.TELEGRAM_OUTBOUND_INTER_MESSAGE_MAX_MS = '3000';
    expect(estimateQuickSendAdapter({ channel: 'telegram', recipients: 11 }).estimatedMs).toBe(20_000);
  });
});

describe('sendQuickAdapterMessage — kiểm sớm (không chạm DB/nhà cung cấp)', () => {
  const authUser = { id: 1, role: 'user' };

  it('kênh lạ -> 404', async () => {
    await expect(sendQuickAdapterMessage({ channel: 'zalo', authUser, body: {} }))
      .rejects.toMatchObject({ status: 404 });
  });

  it('cờ tắt -> 409 CHANNEL_DISABLED (kiểm TRƯỚC dữ liệu)', async () => {
    await expect(sendQuickAdapterMessage({ channel: 'telegram', authUser, body: {} }))
      .rejects.toMatchObject({ status: 409, code: 'CHANNEL_DISABLED' });
    await expect(sendQuickAdapterMessage({ channel: 'whatsapp', authUser, body: {} }))
      .rejects.toMatchObject({ status: 409, code: 'CHANNEL_DISABLED' });
  });

  it.each([
    ['telegram', { accountId: 1, recipientKey: 'abc', message: 'hi' }, 'INVALID_RECIPIENT'],
    ['telegram', { accountId: 1, recipientKey: '12;34', message: 'hi' }, 'INVALID_RECIPIENT'],
    ['telegram', { accountId: 1, recipientKey: '123', message: '   ' }, 'INVALID_MESSAGE'],
    ['telegram', { accountId: 1, recipientKey: '123', message: 'x'.repeat(4001) }, 'INVALID_MESSAGE'],
    ['telegram', { recipientKey: '123', message: 'hi' }, 'INVALID_ACCOUNT'],
    ['whatsapp', { sessionKey: '1-abc', recipientKey: '1234567', message: 'hi' }, 'INVALID_RECIPIENT'],
    ['whatsapp', { sessionKey: '1-abc', recipientKey: 'abc', message: 'hi' }, 'INVALID_RECIPIENT'],
    ['whatsapp', { sessionKey: '1-abc', recipientKey: '0912345678', message: 'x'.repeat(4097) }, 'INVALID_MESSAGE'],
    ['whatsapp', { recipientKey: '0912345678', message: 'hi' }, 'INVALID_ACCOUNT'],
  ])('%s dữ liệu sai -> 400 %s', async (channel, body, code) => {
    process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED = 'true';
    process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED = 'true';
    await expect(sendQuickAdapterMessage({ channel, authUser, body })).rejects.toMatchObject({ status: 400, code });
  });
});

describe('listQuickSendConversations — kiểm sớm', () => {
  it('kênh lạ -> 404', async () => {
    await expect(listQuickSendConversations({ channel: 'zalo', ownerUserId: 1, accountRef: 'x' }))
      .rejects.toMatchObject({ status: 404 });
  });

  it('WhatsApp: sessionKey của chủ khác hoặc sai dạng -> 404 (không chạm DB)', async () => {
    await expect(listQuickSendConversations({ channel: 'whatsapp', ownerUserId: 1, accountRef: '2-abc' }))
      .rejects.toMatchObject({ status: 404 });
    await expect(listQuickSendConversations({ channel: 'whatsapp', ownerUserId: 1, accountRef: '1-a:b' }))
      .rejects.toMatchObject({ status: 404 });
    // '11-abc' bắt đầu bằng '1' nhưng KHÔNG bằng '1-' -> vẫn chủ khác.
    await expect(listQuickSendConversations({ channel: 'whatsapp', ownerUserId: 1, accountRef: '11-abc' }))
      .rejects.toMatchObject({ status: 404 });
  });
});

/**
 * Bảng input -> output GHIM CHUNG với FE: frontend/src/features/campaigns/utils/__tests__/quickSendAdapter.phone.spec.js
 * giữ NGUYÊN bảng này. Sửa một bên mà quên bên kia là đỏ một trong hai ca.
 */
const WHATSAPP_PHONE_TABLE = [
  ['0912345678', '84912345678'],
  ['84912345678', '84912345678'],
  ['+84912345678', '84912345678'],
  ['0912 345 678', '84912345678'],
  ['0912-345-678', '84912345678'],
  ['(0912) 345.678', '84912345678'],
  ['1234567', null],
  ['abc', null],
  ['', null],
  ['0', null],
  ['1234567890123456', null],
  ['12345678', '12345678'],
  ['123456789012345', '123456789012345'],
];

describe('normalizeWhatsAppPhone BE — bảng ghim chung với FE', () => {
  it.each(WHATSAPP_PHONE_TABLE)('%j -> %j', (input, expected) => {
    expect(normalizeWhatsAppPhone(input)).toBe(expected);
  });
});
