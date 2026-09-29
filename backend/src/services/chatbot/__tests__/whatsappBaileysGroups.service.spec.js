/**
 * P8b — `mapBaileysGroups`: kết quả THẬT của Baileys `groupFetchAllParticipating()` là OBJECT keyed theo jid
 * (`{ '<id>@g.us': { id, subject, size, participants, ... } }`) — không phải mảng. Mock đúng hình dạng đó.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const listSessionKeys = jest.fn();
jest.unstable_mockModule(
  '../../../repositories/chatbot/whatsappBaileysSession.repository.js',
  () => ({ default: { listSessionKeys } })
);

let service;
beforeEach(async () => {
  jest.clearAllMocks();
  jest.resetModules();
  listSessionKeys.mockResolvedValue([]);
  service = await import('../whatsappBaileys.service.js');
  await service.profileCacheReady;
});

describe('mapBaileysGroups', () => {
  it('object keyed theo jid -> mảng {recipientKey, title, membersCount}, sắp theo tên', () => {
    const all = {
      '120363000000000002@g.us': { id: '120363000000000002@g.us', subject: 'Zeta', size: 5, participants: [{}, {}] },
      '120363000000000001@g.us': { id: '120363000000000001@g.us', subject: 'Alpha', size: 12, participants: [] },
    };
    expect(service.mapBaileysGroups(all)).toEqual([
      { recipientKey: '120363000000000001@g.us', title: 'Alpha', membersCount: 12 },
      { recipientKey: '120363000000000002@g.us', title: 'Zeta', membersCount: 5 },
    ]);
  });

  it('thiếu subject -> dùng jid làm tên; thiếu size -> null; bỏ mục không phải @g.us; rỗng -> []', () => {
    expect(service.mapBaileysGroups({
      '120363000000000003@g.us': { id: '120363000000000003@g.us' },
      '84912345678@s.whatsapp.net': { id: '84912345678@s.whatsapp.net', subject: 'không phải nhóm' },
    })).toEqual([{ recipientKey: '120363000000000003@g.us', title: '120363000000000003@g.us', membersCount: null }]);
    expect(service.mapBaileysGroups({})).toEqual([]);
    expect(service.mapBaileysGroups(undefined)).toEqual([]);
  });
});
