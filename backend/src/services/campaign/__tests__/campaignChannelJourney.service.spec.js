/**
 * P8b — journey khách sau khi kênh adapter (WhatsApp) gửi thành công: chỉ ghi khi TÌM THẤY khách theo SĐT trong workspace,
 * không ghi cho nhóm/Telegram, không bao giờ ném lỗi.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { recordAdapterSentJourney } from '../campaignChannelJourney.service.js';

const WA = { key: 'whatsapp', recipientIsPhone: true, journeyEventType: 'whatsapp_sent' };
const TG = { key: 'telegram' };

const makeRepo = ({ customerId = 55, findError = null, insertError = null } = {}) => ({
  findCustomerIdByPhone: jest.fn(async () => {
    if (findError) throw findError;
    return customerId;
  }),
  insertChannelSentJourney: jest.fn(async () => {
    if (insertError) throw insertError;
  }),
});

const base = {
  descriptor: WA,
  workspaceOwnerId: 3,
  recipient: { recipientKey: '84912345678' },
  campaignId: 2,
  runId: 9,
  nodeId: 4152,
  messageId: 777,
};

describe('recordAdapterSentJourney', () => {
  it('tìm thấy khách -> ghi whatsapp_sent, kênh whatsapp, event_data {ccmId, nodeId}, khách tra theo CHỦ workspace', async () => {
    const repo = makeRepo({ customerId: 55 });
    await expect(recordAdapterSentJourney(base, { repo })).resolves.toBe(true);
    expect(repo.findCustomerIdByPhone).toHaveBeenCalledWith(3, '84912345678');
    expect(repo.insertChannelSentJourney).toHaveBeenCalledTimes(1);
    expect(repo.insertChannelSentJourney).toHaveBeenCalledWith({
      customerId: 55,
      campaignId: 2,
      runId: 9,
      nodeId: 4152,
      eventType: 'whatsapp_sent',
      eventChannel: 'whatsapp',
      eventData: { ccmId: 777, nodeId: 4152 },
    });
  });

  it('KHÔNG tìm thấy khách -> KHÔNG ghi gì', async () => {
    const repo = makeRepo({ customerId: null });
    await expect(recordAdapterSentJourney(base, { repo })).resolves.toBe(false);
    expect(repo.findCustomerIdByPhone).toHaveBeenCalledTimes(1);
    expect(repo.insertChannelSentJourney).not.toHaveBeenCalled();
  });

  it('người nhận là NHÓM (isGroup) -> không tra khách, không ghi', async () => {
    const repo = makeRepo();
    await expect(recordAdapterSentJourney({
      ...base,
      recipient: { recipientKey: '120363012345678901@g.us', isGroup: true },
    }, { repo })).resolves.toBe(false);
    expect(repo.findCustomerIdByPhone).not.toHaveBeenCalled();
    expect(repo.insertChannelSentJourney).not.toHaveBeenCalled();
  });

  it('kênh không khai journeyEventType (Telegram) hoặc không phải SĐT -> không làm gì', async () => {
    const repo = makeRepo();
    await expect(recordAdapterSentJourney({ ...base, descriptor: TG }, { repo })).resolves.toBe(false);
    await expect(recordAdapterSentJourney({
      ...base,
      descriptor: { key: 'x', journeyEventType: 'x_sent' },
    }, { repo })).resolves.toBe(false);
    expect(repo.findCustomerIdByPhone).not.toHaveBeenCalled();
  });

  it('thiếu chủ workspace -> không tra (khách phải thuộc một chủ xác định)', async () => {
    const repo = makeRepo();
    await expect(recordAdapterSentJourney({ ...base, workspaceOwnerId: null }, { repo })).resolves.toBe(false);
    expect(repo.findCustomerIdByPhone).not.toHaveBeenCalled();
  });

  it('id node không phải số (trình dựng) -> id_node null, event_data giữ nguyên id chuỗi', async () => {
    const repo = makeRepo();
    await recordAdapterSentJourney({ ...base, nodeId: 'node-abc' }, { repo });
    expect(repo.insertChannelSentJourney.mock.calls[0][0]).toMatchObject({
      nodeId: null,
      eventData: { ccmId: 777, nodeId: 'node-abc' },
    });
  });

  it('lỗi CSDL (tra hoặc ghi) -> KHÔNG ném, trả false (khách đã nhận tin)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(recordAdapterSentJourney(base, { repo: makeRepo({ findError: new Error('db down') }) })).resolves.toBe(false);
    await expect(recordAdapterSentJourney(base, { repo: makeRepo({ insertError: new Error('check violation') }) })).resolves.toBe(false);
    warn.mockRestore();
  });
});
