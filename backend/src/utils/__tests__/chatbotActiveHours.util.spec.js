import {
  isWithinActiveHours,
  normalizeChatbotActiveHours,
  currentOutsideWindowStart,
  ActiveHoursValidationError,
} from '../chatbotActiveHours.util.js';

describe('chatbotActiveHours.util', () => {
  describe('isWithinActiveHours', () => {
    it('returns true when config is null, undefined, or empty', () => {
      expect(isWithinActiveHours(null)).toBe(true);
      expect(isWithinActiveHours(undefined)).toBe(true);
      expect(isWithinActiveHours({})).toBe(true);
    });

    describe('same-day window (08:00 – 17:30)', () => {
      const config = { start: '08:00', end: '17:30' };

      // Helper tạo Date tương ứng giờ VN (UTC+7)
      // Giờ VN = UTC + 7 -> Giờ UTC = Giờ VN - 7
      const makeVnDate = (hours, minutes, seconds = 0) => {
        const d = new Date('2026-09-15T00:00:00.000Z');
        // Đặt giờ UTC sao cho khi +7 ra đúng hours:minutes
        d.setUTCHours(hours - 7, minutes, seconds, 0);
        return d;
      };

      it('includes start boundary (08:00:00)', () => {
        expect(isWithinActiveHours(config, makeVnDate(8, 0, 0))).toBe(true);
      });

      it('includes middle of window (12:00:00)', () => {
        expect(isWithinActiveHours(config, makeVnDate(12, 0, 0))).toBe(true);
      });

      it('includes last second before end (17:29:59)', () => {
        expect(isWithinActiveHours(config, makeVnDate(17, 29, 59))).toBe(true);
      });

      it('excludes end boundary (17:30:00)', () => {
        expect(isWithinActiveHours(config, makeVnDate(17, 30, 0))).toBe(false);
      });

      it('excludes before start (07:59:59)', () => {
        expect(isWithinActiveHours(config, makeVnDate(7, 59, 59))).toBe(false);
      });

      it('excludes evening (20:00:00)', () => {
        expect(isWithinActiveHours(config, makeVnDate(20, 0, 0))).toBe(false);
      });
    });

    describe('overnight window (18:00 – 05:00)', () => {
      const config = { start: '18:00', end: '05:00' };

      const makeVnDate = (hours, minutes, seconds = 0) => {
        const d = new Date('2026-09-15T00:00:00.000Z');
        d.setUTCHours(hours - 7, minutes, seconds, 0);
        return d;
      };

      it('includes start boundary (18:00:00)', () => {
        expect(isWithinActiveHours(config, makeVnDate(18, 0, 0))).toBe(true);
      });

      it('includes late night before midnight (23:59:59)', () => {
        expect(isWithinActiveHours(config, makeVnDate(23, 59, 59))).toBe(true);
      });

      it('includes midnight (00:00:00)', () => {
        expect(isWithinActiveHours(config, makeVnDate(0, 0, 0))).toBe(true);
      });

      it('includes early morning before end (04:59:59)', () => {
        expect(isWithinActiveHours(config, makeVnDate(4, 59, 59))).toBe(true);
      });

      it('excludes end boundary (05:00:00)', () => {
        expect(isWithinActiveHours(config, makeVnDate(5, 0, 0))).toBe(false);
      });

      it('excludes midday (12:00:00)', () => {
        expect(isWithinActiveHours(config, makeVnDate(12, 0, 0))).toBe(false);
      });

      it('excludes right before start (17:59:59)', () => {
        expect(isWithinActiveHours(config, makeVnDate(17, 59, 59))).toBe(false);
      });
    });

    describe('overnight window around midnight (23:00 – 01:00)', () => {
      const config = { start: '23:00', end: '01:00' };

      const makeVnDate = (hours, minutes) => {
        const d = new Date('2026-09-15T00:00:00.000Z');
        d.setUTCHours(hours - 7, minutes, 0, 0);
        return d;
      };

      it('23:30 is inside', () => {
        expect(isWithinActiveHours(config, makeVnDate(23, 30))).toBe(true);
      });

      it('00:30 is inside', () => {
        expect(isWithinActiveHours(config, makeVnDate(0, 30))).toBe(true);
      });

      it('01:30 is outside', () => {
        expect(isWithinActiveHours(config, makeVnDate(1, 30))).toBe(false);
      });
    });
  });

  describe('normalizeChatbotActiveHours', () => {
    it('normalizes null or undefined to null', () => {
      expect(normalizeChatbotActiveHours(null)).toBeNull();
      expect(normalizeChatbotActiveHours(undefined)).toBeNull();
      expect(normalizeChatbotActiveHours('')).toBeNull();
    });

    it('normalizes valid configuration', () => {
      const result = normalizeChatbotActiveHours({
        start: '8:30',
        end: '17:00',
        outsideAction: 'message',
        outsideMessage: '  Ngoai gio ho tro  ',
      });
      expect(result).toEqual({
        days: [1, 2, 3, 4, 5, 6, 0],
        slots: [{ start: '08:30', end: '17:00' }],
        start: '08:30',
        end: '17:00',
        outsideAction: 'message',
        outsideMessage: 'Ngoai gio ho tro',
      });
    });

    it('normalizes configuration with custom days and multiple slots', () => {
      const result = normalizeChatbotActiveHours({
        days: [1, 2, 3, 4, 5],
        slots: [
          { start: '11:30', end: '13:30' },
          { start: '18:00', end: '05:00' },
        ],
        outsideAction: 'message',
        outsideMessage: 'Ngoài giờ hỗ trợ',
      });
      expect(result).toEqual({
        days: [1, 2, 3, 4, 5],
        slots: [
          { start: '11:30', end: '13:30' },
          { start: '18:00', end: '05:00' },
        ],
        start: '11:30',
        end: '13:30',
        outsideAction: 'message',
        outsideMessage: 'Ngoài giờ hỗ trợ',
      });
    });

    it('defaults outsideAction to silent if omitted', () => {
      const result = normalizeChatbotActiveHours({
        start: '09:00',
        end: '18:00',
      });
      expect(result.outsideAction).toBe('silent');
      expect(result.outsideMessage).toBe('');
    });

    it('throws when start equals end', () => {
      expect(() =>
        normalizeChatbotActiveHours({ start: '08:00', end: '08:00' })
      ).toThrow(ActiveHoursValidationError);
    });

    it('throws when days array is empty or contains invalid days', () => {
      expect(() =>
        normalizeChatbotActiveHours({
          days: [],
          start: '08:00',
          end: '17:00',
        })
      ).toThrow(ActiveHoursValidationError);

      expect(() =>
        normalizeChatbotActiveHours({
          days: [9, 10],
          start: '08:00',
          end: '17:00',
        })
      ).toThrow(ActiveHoursValidationError);
    });

    it('throws when slots overlap within the same schedule', () => {
      // 2 ca cùng ngày bị trùng lấn (08:00 - 12:00 và 11:30 - 14:00)
      expect(() =>
        normalizeChatbotActiveHours({
          slots: [
            { start: '08:00', end: '12:00' },
            { start: '11:30', end: '14:00' },
          ],
        })
      ).toThrow(ActiveHoursValidationError);

      // Ca qua đêm trùng với ca rạng sáng (18:00 - 05:00 và 04:00 - 08:00)
      expect(() =>
        normalizeChatbotActiveHours({
          slots: [
            { start: '18:00', end: '05:00' },
            { start: '04:00', end: '08:00' },
          ],
        })
      ).toThrow(ActiveHoursValidationError);
    });

    it('throws when slots count exceeds maximum (5)', () => {
      expect(() =>
        normalizeChatbotActiveHours({
          slots: [
            { start: '01:00', end: '02:00' },
            { start: '03:00', end: '04:00' },
            { start: '05:00', end: '06:00' },
            { start: '07:00', end: '08:00' },
            { start: '09:00', end: '10:00' },
            { start: '11:00', end: '12:00' },
          ],
        })
      ).toThrow(ActiveHoursValidationError);
    });

    it('throws when time format is invalid', () => {
      expect(() =>
        normalizeChatbotActiveHours({ start: '25:00', end: '17:00' })
      ).toThrow(ActiveHoursValidationError);

      expect(() =>
        normalizeChatbotActiveHours({ start: '08:65', end: '17:00' })
      ).toThrow(ActiveHoursValidationError);

      expect(() =>
        normalizeChatbotActiveHours({ start: 'abc', end: '17:00' })
      ).toThrow(ActiveHoursValidationError);
    });

    it('throws when outsideAction is message but message is empty', () => {
      expect(() =>
        normalizeChatbotActiveHours({
          start: '08:00',
          end: '17:00',
          outsideAction: 'message',
          outsideMessage: '   ',
        })
      ).toThrow(ActiveHoursValidationError);
    });

    it('throws when outsideMessage exceeds 500 characters', () => {
      expect(() =>
        normalizeChatbotActiveHours({
          start: '08:00',
          end: '17:00',
          outsideAction: 'message',
          outsideMessage: 'a'.repeat(501),
        })
      ).toThrow(ActiveHoursValidationError);
    });
  });

  describe('isWithinActiveHours — đa ca & đa ngày', () => {
    // 2026-09-18 là Thứ 6 (Friday, getUTCDay() = 5).
    // 2026-09-19 là Thứ 7 (Saturday, getUTCDay() = 6).
    // 2026-09-20 là Chủ Nhật (Sunday, getUTCDay() = 0).
    // 2026-09-21 là Thứ 2 (Monday, getUTCDay() = 1).
    const makeVnDateOn = (isoDateStr, hours, minutes, seconds = 0) => {
      const d = new Date(`${isoDateStr}T00:00:00.000Z`);
      d.setUTCHours(hours - 7, minutes, seconds, 0);
      return d;
    };

    it('áp dụng Thứ 2 - Thứ 6 với ca trưa (11:30 - 13:30) và ca tối qua đêm (18:00 - 05:00)', () => {
      const config = {
        days: [1, 2, 3, 4, 5],
        slots: [
          { start: '11:30', end: '13:30' },
          { start: '18:00', end: '05:00' },
        ],
      };

      // Thứ 6 (2026-09-18):
      // 10:00: ngoài giờ
      expect(isWithinActiveHours(config, makeVnDateOn('2026-09-18', 10, 0))).toBe(false);
      // 12:00: trong ca trưa
      expect(isWithinActiveHours(config, makeVnDateOn('2026-09-18', 12, 0))).toBe(true);
      // 15:00: giữa 2 ca
      expect(isWithinActiveHours(config, makeVnDateOn('2026-09-18', 15, 0))).toBe(false);
      // 19:00: trong ca tối
      expect(isWithinActiveHours(config, makeVnDateOn('2026-09-18', 19, 0))).toBe(true);

      // Thứ 7 (2026-09-19): Thứ 7 không nằm trong days, nhưng ca Thứ 6 vắt qua tới 05:00 sáng Thứ 7!
      // 03:00 sáng Thứ 7: VẪN ĐANG TRONG CA TỐI THỨ 6!
      expect(isWithinActiveHours(config, makeVnDateOn('2026-09-19', 3, 0))).toBe(true);
      // 05:01 sáng Thứ 7: Ca Thứ 6 đã kết thúc
      expect(isWithinActiveHours(config, makeVnDateOn('2026-09-19', 5, 1))).toBe(false);
      // 12:00 trưa Thứ 7: Không chạy vì Thứ 7 không trong days
      expect(isWithinActiveHours(config, makeVnDateOn('2026-09-19', 12, 0))).toBe(false);
      // 20:00 tối Thứ 7: Không chạy vì Thứ 7 không trong days
      expect(isWithinActiveHours(config, makeVnDateOn('2026-09-19', 20, 0))).toBe(false);

      // Chủ Nhật (2026-09-20): cả ngày không chạy
      expect(isWithinActiveHours(config, makeVnDateOn('2026-09-20', 12, 0))).toBe(false);

      // Thứ 2 (2026-09-21):
      // 03:00 sáng Thứ 2: Chủ Nhật không có ca đêm, nên rạng sáng Thứ 2 không active
      expect(isWithinActiveHours(config, makeVnDateOn('2026-09-21', 3, 0))).toBe(false);
      // 12:00 trưa Thứ 2: chạy ca trưa
      expect(isWithinActiveHours(config, makeVnDateOn('2026-09-21', 12, 0))).toBe(true);
    });
  });

  describe('currentOutsideWindowStart — mốc bắt đầu đợt ngoài giờ (giờ VN)', () => {
    // Bảng mục 4 của _internal/PLAN_KHUNG_GIO_CHATBOT_TRA_LOI_2026-09-15.md
    it.each([
      [{ start: '18:00', end: '05:00' }, '2026-09-15T10:00:00+07:00', '2026-09-15T05:00:00+07:00'],
      [{ start: '18:00', end: '05:00' }, '2026-09-15T17:59:00+07:00', '2026-09-15T05:00:00+07:00'],
      [{ start: '18:00', end: '05:00' }, '2026-09-16T05:00:00+07:00', '2026-09-16T05:00:00+07:00'],
      [{ start: '08:00', end: '17:30' }, '2026-09-15T20:00:00+07:00', '2026-09-15T17:30:00+07:00'],
      [{ start: '08:00', end: '17:30' }, '2026-09-16T07:00:00+07:00', '2026-09-15T17:30:00+07:00'],
    ])('%o lúc %s → %s', (config, nowIso, expectedIso) => {
      expect(currentOutsideWindowStart(config, new Date(nowIso)).toISOString())
        .toBe(new Date(expectedIso).toISOString());
    });
  });
});
