/**
 * P8b — service danh sách nhóm WhatsApp (404 phiên khác chủ / 409 chưa kết nối / danh sách / 504).
 */
import { describe, it, expect, jest } from '@jest/globals';
import { listWhatsAppGroupsForSession, WHATSAPP_SESSION_NOT_READY_MESSAGE } from '../whatsappGroups.service.js';

const makeDeps = ({ session = { status: 'open' }, groups = [], listError = null } = {}) => {
  const service = {
    getSession: jest.fn(() => session),
    listGroups: jest.fn(async () => {
      if (listError) throw listError;
      return groups;
    }),
  };
  return { service, deps: { loadService: async () => service, timeoutMs: 50 } };
};

describe('listWhatsAppGroupsForSession', () => {
  it.each([
    ['phiên của chủ khác (tiền tố khác)', { ownerUserId: 41, sessionKey: '40-default' }],
    ['tiền tố phải khớp cả dấu gạch (chủ 4 không dùng 40-default)', { ownerUserId: 4, sessionKey: '40-default' }],
    ['sessionKey sai định dạng', { ownerUserId: 40, sessionKey: '40-../x' }],
    ['thiếu chủ', { ownerUserId: 0, sessionKey: '0-default' }],
  ])('%s -> 404, không chạm service', async (_label, input) => {
    const { service, deps } = makeDeps();
    await expect(listWhatsAppGroupsForSession(input, deps)).rejects.toMatchObject({ status: 404 });
    expect(service.getSession).not.toHaveBeenCalled();
    expect(service.listGroups).not.toHaveBeenCalled();
  });

  it.each([
    ['không có phiên', { session: null }],
    ['phiên connecting', { session: { status: 'connecting' } }],
  ])('%s -> 409 kèm câu quét lại QR, không gọi listGroups', async (_label, over) => {
    const { service, deps } = makeDeps(over);
    await expect(listWhatsAppGroupsForSession({ ownerUserId: 40, sessionKey: '40-default' }, deps)).rejects.toMatchObject({
      status: 409,
      message: WHATSAPP_SESSION_NOT_READY_MESSAGE,
    });
    expect(service.listGroups).not.toHaveBeenCalled();
  });

  it('mất kết nối giữa chừng ("is not connected") -> 409', async () => {
    const { deps } = makeDeps({ listError: new Error('WhatsApp session 40-default is not connected') });
    await expect(listWhatsAppGroupsForSession({ ownerUserId: 40, sessionKey: '40-default' }, deps)).rejects.toMatchObject({ status: 409 });
  });

  it('đúng -> trả danh sách từ service theo sessionKey', async () => {
    const groups = [{ recipientKey: '120363000000000001@g.us', title: 'Khách VIP', membersCount: 12 }];
    const { service, deps } = makeDeps({ groups });
    await expect(listWhatsAppGroupsForSession({ ownerUserId: 40, sessionKey: '40-default' }, deps)).resolves.toEqual(groups);
    expect(service.listGroups).toHaveBeenCalledWith('40-default');
  });

  it('quá thời gian -> 504', async () => {
    const { service, deps } = makeDeps();
    service.listGroups = jest.fn(() => new Promise(() => {}));
    await expect(listWhatsAppGroupsForSession({ ownerUserId: 40, sessionKey: '40-default' }, deps)).rejects.toMatchObject({ status: 504 });
  });

  it('lỗi lạ -> 502 (không lộ nội dung lỗi gốc)', async () => {
    const { deps } = makeDeps({ listError: new Error('boom nội bộ') });
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(listWhatsAppGroupsForSession({ ownerUserId: 40, sessionKey: '40-default' }, deps)).rejects.toMatchObject({
      status: 502,
      message: expect.not.stringContaining('boom'),
    });
    errSpy.mockRestore();
  });
});
