import chatbotActiveHoursService from '../chatbotActiveHours.service.js';

describe('chatbotActiveHours.service', () => {
  beforeEach(async () => {
    await chatbotActiveHoursService.clearAllForTest();
  });

  describe('checkBeforeAi', () => {
    it('allows when activeHours is null or undefined (24/7)', async () => {
      const res = await chatbotActiveHoursService.checkBeforeAi({
        activeHours: null,
        channel: 'zalo_personal',
        chatbotId: 'bot-1',
        senderKey: 'user-1',
      });
      expect(res.allowed).toBe(true);
    });

    it('allows when current time is within active hours', async () => {
      // Giả lập config bao trùm 00:00 - 23:59 (hầu như toàn thời gian)
      const res = await chatbotActiveHoursService.checkBeforeAi({
        activeHours: { start: '00:00', end: '23:59', outsideAction: 'silent' },
        channel: 'zalo_personal',
        chatbotId: 'bot-1',
        senderKey: 'user-1',
        now: new Date('2026-09-15T05:00:00.000Z'), // 12:00 VN
      });
      expect(res.allowed).toBe(true);
    });

    it('blocks and remains silent when outside hours with action silent', async () => {
      const res = await chatbotActiveHoursService.checkBeforeAi({
        activeHours: { start: '08:00', end: '17:00', outsideAction: 'silent' },
        channel: 'zalo_personal',
        chatbotId: 'bot-1',
        senderKey: 'user-1',
        now: new Date('2026-09-15T15:00:00.000Z'), // 22:00 VN -> ngoài giờ
      });
      expect(res.allowed).toBe(false);
      expect(res.shouldNotify).toBe(false);
      expect(res.staticReply).toBeNull();
      expect(res.reason).toBe('outside_active_hours');
    });

    it('blocks and flags notify on first message when action is message, then suppresses on second message', async () => {
      const activeHours = {
        start: '08:00',
        end: '17:00',
        outsideAction: 'message',
        outsideMessage: 'Hiện ngoài giờ hỗ trợ',
      };
      const now = new Date('2026-09-15T15:00:00.000Z'); // 22:00 VN

      // Lần 1: shouldNotify = true
      const first = await chatbotActiveHoursService.checkBeforeAi({
        activeHours,
        channel: 'zalo_personal',
        chatbotId: 'bot-1',
        senderKey: 'user-1',
        now,
      });
      expect(first.allowed).toBe(false);
      expect(first.shouldNotify).toBe(true);
      expect(first.staticReply).toBe('Hiện ngoài giờ hỗ trợ');

      // Giả lập gửi thành công và đánh dấu
      await chatbotActiveHoursService.markNotified({
        channel: 'zalo_personal',
        chatbotId: 'bot-1',
        senderKey: 'user-1',
        activeHours,
        now,
      });

      // Lần 2 trong cùng đợt ngoài giờ: shouldNotify = false
      const second = await chatbotActiveHoursService.checkBeforeAi({
        activeHours,
        channel: 'zalo_personal',
        chatbotId: 'bot-1',
        senderKey: 'user-1',
        now: new Date(now.getTime() + 60000), // 1 phút sau
      });
      expect(second.allowed).toBe(false);
      expect(second.shouldNotify).toBe(false);
      expect(second.staticReply).toBeNull();
    });

    it('allows another notification when entering a new outside period', async () => {
      const activeHours = {
        start: '08:00',
        end: '17:00',
        outsideAction: 'message',
        outsideMessage: 'Ngoài giờ',
      };
      const day1Night = new Date('2026-09-15T15:00:00.000Z'); // Đợt 1
      const day2Night = new Date('2026-09-16T15:00:00.000Z'); // Đợt 2 (ngày hôm sau)

      // Đánh dấu ở đợt 1
      await chatbotActiveHoursService.markNotified({
        channel: 'zalo_personal',
        chatbotId: 'bot-1',
        senderKey: 'user-1',
        activeHours,
        now: day1Night,
      });

      // Kiểm tra ở đợt 2: do periodKey đổi, shouldNotify phải là true!
      const nextPeriod = await chatbotActiveHoursService.checkBeforeAi({
        activeHours,
        channel: 'zalo_personal',
        chatbotId: 'bot-1',
        senderKey: 'user-1',
        now: day2Night,
      });
      expect(nextPeriod.allowed).toBe(false);
      expect(nextPeriod.shouldNotify).toBe(true);
      expect(nextPeriod.staticReply).toBe('Ngoài giờ');
    });
  });
});
