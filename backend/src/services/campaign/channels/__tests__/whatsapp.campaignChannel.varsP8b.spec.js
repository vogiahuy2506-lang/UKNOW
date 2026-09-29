/**
 * P8b — cá nhân hoá theo CỘT khối dữ liệu cho WhatsApp: `resolveRecipients` suy ra `vars` từ các cột của mỗi dòng cho những
 * `{{biến}}` có trong nội dung (dùng lại `deriveVariablesForText` của Zalo). Khối dữ liệu xuất dòng dạng object cột,
 * KHÔNG có `vars` — đây là hình dạng thật.
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.unstable_mockModule('../../../chatbot/whatsappBaileys.service.js', () => ({
  getSession: jest.fn(),
  listPersistedSessions: jest.fn(),
  checkNumberExists: jest.fn(),
  sendMessage: jest.fn(),
}));
jest.unstable_mockModule('../../../../repositories/chatbot/whatsappCampaignConversation.repository.js', () => ({
  default: { listOpenWhatsAppConversationsForSession: jest.fn(), countOpenConversationsBySessionKeys: jest.fn() },
  extractPhoneFromExternalId: (externalId) => String(externalId ?? '').split(':').pop(),
}));
jest.unstable_mockModule('../../../../utils/topupLockGate.util.js', () => ({
  whatsappSessionIsLocked: jest.fn(async () => false),
  CHANNEL_ACCOUNT_LOCKED_MESSAGE: 'khoá',
}));

const { whatsappChannelAdapter } = await import('../whatsapp.campaignChannel.js');

const account = { sessionKey: '40-default' };
const resolve = (rows, steps, extra = {}) => whatsappChannelAdapter.resolveRecipients({
  rows,
  config: { recipientSource: 'node', recipientColumn: 'sdt', steps, ...extra },
  account,
});

describe('resolveRecipients — vars theo cột khối dữ liệu (WhatsApp)', () => {
  it('cột trùng tên biến (không phân biệt hoa thường) và cột ngữ nghĩa (Họ tên -> {{ten}}) đều thành vars', async () => {
    const result = await resolve(
      [{ sdt: '0912345678', 'Họ tên': 'Nguyễn Lan', Email: 'lan@x.vn', goi: 'Pro' }],
      [{ message: 'Chào {{ten}}, gói {{GOI}}, mail {{email}}' }]
    );
    expect(result).toHaveLength(1);
    expect(result[0].recipientKey).toBe('84912345678');
    expect(result[0].vars).toEqual({ ten: 'Nguyễn Lan', GOI: 'Pro', email: 'lan@x.vn' });
  });

  it('mỗi dòng có vars RIÊNG (không lẫn dữ liệu người khác)', async () => {
    const result = await resolve(
      [
        { sdt: '0912345678', name: 'An' },
        { sdt: '0913345678', name: 'Bình' },
      ],
      [{ message: 'Chào {{ten}}' }]
    );
    expect(result.map((r) => r.vars.ten)).toEqual(['An', 'Bình']);
  });

  it('biến không có cột tương ứng -> chuỗi rỗng (không lộ chữ {{...}} cho khách)', async () => {
    const result = await resolve([{ sdt: '0912345678', name: 'An' }], [{ message: 'Chào {{ten}}, mã {{ma_giam_gia}}' }]);
    expect(result[0].vars.ten).toBe('An');
    expect(result[0].vars.ma_giam_gia).toBe('');
  });

  it('gom biến từ MỌI bước của node', async () => {
    const result = await resolve(
      [{ sdt: '0912345678', name: 'An', thanh_pho: 'Huế' }],
      [{ message: 'Bước 1 {{ten}}' }, { message: 'Bước 2 {{thanh_pho}}' }]
    );
    expect(result[0].vars).toEqual({ ten: 'An', thanh_pho: 'Huế' });
  });

  it('row.vars tường minh thắng giá trị suy ra từ cột', async () => {
    const result = await resolve(
      [{ sdt: '0912345678', name: 'An', vars: { ten: 'Anh An' } }],
      [{ message: 'Chào {{ten}}' }]
    );
    expect(result[0].vars.ten).toBe('Anh An');
  });

  it('nội dung không có biến -> vars rỗng (không suy ra thừa)', async () => {
    const result = await resolve([{ sdt: '0912345678', name: 'An' }], [{ message: 'Xin chào' }]);
    expect(result[0].vars).toEqual({});
  });

  it('nguồn nhập tay (dòng chỉ có recipientKey) không vỡ khi nội dung có biến', async () => {
    const result = await whatsappChannelAdapter.resolveRecipients({
      rows: [{ recipientKey: '0912345678' }],
      config: { recipientSource: 'manual', steps: [{ message: 'Chào {{ten}}' }] },
      account,
    });
    expect(result[0].recipientKey).toBe('84912345678');
    // Tên người không có dữ liệu -> "bạn" (cùng dự phòng như Zalo), không vỡ.
    expect(result[0].vars).toEqual({ ten: 'bạn' });
  });
});
