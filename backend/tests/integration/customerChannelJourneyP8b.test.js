/**
 * P8b — journey khách cho kênh adapter (WhatsApp) trên CSDL THẬT: tra khách theo SĐT trong workspace (so 9 số cuối, chịu
 * được các dạng lưu 0912…/84912…/+84 …), khách workspace khác không bị chạm, và ghi `customer_journey` 'whatsapp_sent'.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import db from '../../src/config/database.js';
import { createUser, truncateAll } from './helpers/db.js';
import customerChannelJourneyRepository from '../../src/repositories/customer/customerChannelJourney.repository.js';
import { recordAdapterSentJourney } from '../../src/services/campaign/campaignChannelJourney.service.js';

beforeEach(async () => {
  await truncateAll();
});

async function insertCustomer({ userId, phone = null, zaloPhone = null, workspaceOwnerId = null }) {
  const { rows } = await db.query(
    `INSERT INTO customers (id_user, workspace_owner_id, phone, zalo_phone, email)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [userId, workspaceOwnerId, phone, zaloPhone, `c${Date.now()}${Math.random()}@x.local`]
  );
  return rows[0].id;
}

const WA = { key: 'whatsapp', recipientIsPhone: true, journeyEventType: 'whatsapp_sent' };

describe('customerChannelJourney (CSDL thật)', () => {
  it.each([
    ['0912345678'],
    ['84912345678'],
    ['+84 912 345 678'],
    ['0912.345.678'],
  ])('khách lưu SĐT dạng "%s" vẫn tìm ra bằng số chuẩn hoá 84912345678', async (stored) => {
    const owner = await createUser({ username: `p8bj_${Date.now()}_${Math.floor(Math.random() * 1e6)}` });
    const customerId = await insertCustomer({ userId: owner.id, phone: stored });
    await expect(customerChannelJourneyRepository.findCustomerIdByPhone(owner.id, '84912345678')).resolves.toBe(customerId);
  });

  it('tra cả zalo_phone; không có khách -> null; số quá ngắn -> null', async () => {
    const owner = await createUser({ username: `p8bj2_${Date.now()}` });
    const customerId = await insertCustomer({ userId: owner.id, zaloPhone: '0913345678' });
    await expect(customerChannelJourneyRepository.findCustomerIdByPhone(owner.id, '84913345678')).resolves.toBe(customerId);
    await expect(customerChannelJourneyRepository.findCustomerIdByPhone(owner.id, '84999999999')).resolves.toBeNull();
    await expect(customerChannelJourneyRepository.findCustomerIdByPhone(owner.id, '1234')).resolves.toBeNull();
  });

  it('khách của workspace KHÁC không bị tra ra; nhân viên tạo khách (workspace_owner_id = chủ) vẫn thuộc chủ', async () => {
    const owner = await createUser({ username: `p8bj3_${Date.now()}` });
    const other = await createUser({ username: `p8bj4_${Date.now()}` });
    await insertCustomer({ userId: other.id, phone: '0912345678' });
    await expect(customerChannelJourneyRepository.findCustomerIdByPhone(owner.id, '84912345678')).resolves.toBeNull();

    const staff = await createUser({ username: `p8bj5_${Date.now()}` });
    const viaStaff = await insertCustomer({ userId: staff.id, workspaceOwnerId: owner.id, phone: '0987654321' });
    await expect(customerChannelJourneyRepository.findCustomerIdByPhone(owner.id, '84987654321')).resolves.toBe(viaStaff);
  });

  it('recordAdapterSentJourney: có khách -> đúng 1 dòng whatsapp_sent (kênh whatsapp, event_data {ccmId,nodeId}); không khách -> 0 dòng', async () => {
    const owner = await createUser({ username: `p8bj6_${Date.now()}` });
    const customerId = await insertCustomer({ userId: owner.id, phone: '0912345678' });

    await expect(recordAdapterSentJourney({
      descriptor: WA,
      workspaceOwnerId: owner.id,
      recipient: { recipientKey: '84912345678' },
      campaignId: null,
      runId: null,
      nodeId: 4152,
      messageId: 99,
    })).resolves.toBe(true);
    await expect(recordAdapterSentJourney({
      descriptor: WA,
      workspaceOwnerId: owner.id,
      recipient: { recipientKey: '84900000000' },
      campaignId: null,
      runId: null,
      nodeId: 4152,
      messageId: 100,
    })).resolves.toBe(false);

    const { rows } = await db.query(
      `SELECT id_customer, id_node, event_type, event_channel, event_data
         FROM customer_journey`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id_customer: String(customerId),
      id_node: '4152',
      event_type: 'whatsapp_sent',
      event_channel: 'whatsapp',
    });
    expect(rows[0].event_data).toEqual({ ccmId: 99, nodeId: 4152 });
  });

  it('lỗi ghi (id_campaign không tồn tại vi phạm khoá ngoại) -> KHÔNG ném, trả false', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const owner = await createUser({ username: `p8bj7_${Date.now()}` });
    await insertCustomer({ userId: owner.id, phone: '0912345678' });
    await expect(recordAdapterSentJourney({
      descriptor: WA,
      workspaceOwnerId: owner.id,
      recipient: { recipientKey: '84912345678' },
      campaignId: 987654321,
      runId: null,
      nodeId: 1,
      messageId: 1,
    })).resolves.toBe(false);
    warn.mockRestore();
  });
});
