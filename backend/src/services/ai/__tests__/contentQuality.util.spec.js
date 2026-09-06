import { describe, expect, it } from '@jest/globals';
import {
  scoreGeneratedContent,
  isHtmlOrTextEmpty,
  hasVietnameseDiacritics,
  extractTopicKeywords,
  containsAnyTopicKeyword,
  findUnresolvedPlaceholders,
  resolveExpectedSteps,
} from '../contentQuality.util.js';

describe('7A contentQuality.util.js - Thước đo nội dung AI', () => {
  describe('isHtmlOrTextEmpty', () => {
    it('nhận diện chính xác chuỗi rỗng, khoảng trắng và HTML rỗng', () => {
      expect(isHtmlOrTextEmpty('')).toBe(true);
      expect(isHtmlOrTextEmpty('   ')).toBe(true);
      expect(isHtmlOrTextEmpty(null)).toBe(true);
      expect(isHtmlOrTextEmpty(undefined)).toBe(true);
      expect(isHtmlOrTextEmpty('<p></p>')).toBe(true);
      expect(isHtmlOrTextEmpty('<p><br></p>')).toBe(true);
      expect(isHtmlOrTextEmpty('<div><span>&nbsp; </span></div>')).toBe(true);

      expect(isHtmlOrTextEmpty('Xin chào')).toBe(false);
      expect(isHtmlOrTextEmpty('<p>Xin chào quý khách</p>')).toBe(false);
    });
  });

  describe('hasVietnameseDiacritics', () => {
    it('kiểm tra chuẩn xác ký tự tiếng Việt có dấu', () => {
      expect(hasVietnameseDiacritics('Hello world!')).toBe(false);
      expect(hasVietnameseDiacritics('Xin chao quy khach')).toBe(false);
      expect(hasVietnameseDiacritics('Xin chào quý khách!')).toBe(true);
      expect(hasVietnameseDiacritics('Ưu đãi lớn')).toBe(true);
    });
  });

  describe('extractTopicKeywords & containsAnyTopicKeyword', () => {
    it('trích xuất từ khóa topic và tìm kiếm linh hoạt', () => {
      const topic = 'Khuyến mãi, du lịch hè 2026!';
      const kws = extractTopicKeywords(topic);
      expect(kws).toContain('khuyến');
      expect(kws).toContain('mãi');
      expect(kws).toContain('lịch');

      expect(containsAnyTopicKeyword('Chương trình du lịch hấp dẫn', topic)).toBe(true);
      expect(containsAnyTopicKeyword('Du Lich Da Nang', topic)).toBe(true); // diacritics fold match
      expect(containsAnyTopicKeyword('Báo giá phần mềm kế toán doanh nghiệp', topic)).toBe(false);
    });
  });

  describe('findUnresolvedPlaceholders & PLACEHOLDER_UNRESOLVED (Đính chính auto-map)', () => {
    it('Biến nhóm tên người ({{full_name}}, {{ho_ten}}) với templateMappings: [] KHÔNG báo unresolved', () => {
      const text = 'Chào {{full_name}}! Chúc {{ho_ten}} một ngày tốt lành.';
      const unresolved = findUnresolvedPlaceholders(text, []);
      expect(unresolved).toEqual([]);
    });

    it('Biến auto-map email/phone với templateMappings: [] KHÔNG báo unresolved', () => {
      const text = 'Email: {{email}}, SĐT: {{phone}}, SĐT 2: {{sdt}}';
      const unresolved = findUnresolvedPlaceholders(text, []);
      expect(unresolved).toEqual([]);
    });

    it('Biến không thể auto-map ({{coupon_code}}) và không thuộc nhóm tên người -> Báo unresolved', () => {
      const text = 'Chào {{full_name}}! Mã ưu đãi của bạn: {{coupon_code}}';
      const unresolved = findUnresolvedPlaceholders(text, []);
      expect(unresolved).toEqual(['coupon_code']);
    });

    it('Biến {{coupon_code}} đã được khai báo trong templateMappings -> Không báo unresolved', () => {
      const text = 'Chào {{full_name}}! Mã ưu đãi: {{coupon_code}}';
      const mappings = [{ key: 'coupon_code', field: 'discount_col' }];
      const unresolved = findUnresolvedPlaceholders(text, mappings);
      expect(unresolved).toEqual([]);
    });
  });

  describe('resolveExpectedSteps', () => {
    it('tính đúng số bước theo schedule drip và once', () => {
      expect(resolveExpectedSteps({ mode: 'once' })).toBe(1);
      expect(resolveExpectedSteps({ type: 'once' })).toBe(1);
      expect(resolveExpectedSteps({ mode: 'drip', days: 3, slotsPerDay: 1 })).toBe(3);
      expect(resolveExpectedSteps({ type: 'drip', days: 2, slotsPerDay: 2 })).toBe(4);
      expect(resolveExpectedSteps(null)).toBeNull();
    });
  });

  describe('scoreGeneratedContent (Email Channel)', () => {
    it('chấp nhận kịch bản email hợp lệ', () => {
      const script = {
        nodes: [
          {
            id: 'node_send_1',
            nodeType: 'action',
            nodeSubtype: 'send_email',
            config: {
              emailSubject: 'Thông báo khóa học mới',
              emailBody: '<p>Xin chào {{full_name}}, khóa học lập trình đã khai giảng.</p>',
              templateMappings: [],
            },
          },
        ],
      };

      const result = scoreGeneratedContent(script, {
        locale: 'vi',
        topic: 'khóa học lập trình',
        schedule: { mode: 'once' },
      });

      expect(result.ok).toBe(true);
      expect(result.issues).toEqual([]);
    });

    it('bắt lỗi EMPTY_SUBJECT và EMPTY_BODY', () => {
      const script = {
        nodes: [
          {
            id: 'node_send_1',
            nodeSubtype: 'send_email',
            config: {
              emailSubject: '   ',
              emailBody: '<p><br></p>',
            },
          },
        ],
      };

      const result = scoreGeneratedContent(script);
      expect(result.ok).toBe(false);
      const codes = result.issues.map((i) => i.code);
      expect(codes).toContain('EMPTY_SUBJECT');
      expect(codes).toContain('EMPTY_BODY');
    });

    it('bắt lỗi WRONG_LOCALE khi locale=vi nhưng thân thư toàn tiếng Anh', () => {
      const script = {
        nodes: [
          {
            id: 'node_send_1',
            nodeSubtype: 'send_email',
            config: {
              emailSubject: 'Important update for your account',
              emailBody: '<p>Dear customer, here is your weekly summary report.</p>',
            },
          },
        ],
      };

      const result = scoreGeneratedContent(script, { locale: 'vi' });
      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.code === 'WRONG_LOCALE')).toBe(true);
    });

    it('bắt lỗi STEP_COUNT_MISMATCH khi lịch drip 3 bước nhưng chỉ có 2 bước nội dung', () => {
      const script = {
        nodes: [
          {
            id: 'node_send_1',
            nodeSubtype: 'send_email',
            config: {
              emailSteps: [
                { emailSubject: 'Bước 1', emailBody: 'Nội dung bước 1' },
                { emailSubject: 'Bước 2', emailBody: 'Nội dung bước 2' },
              ],
            },
          },
        ],
      };

      const result = scoreGeneratedContent(script, {
        schedule: { mode: 'drip', days: 3, slotsPerDay: 1 },
      });

      expect(result.ok).toBe(false);
      const stepIssue = result.issues.find((i) => i.code === 'STEP_COUNT_MISMATCH');
      expect(stepIssue).toBeDefined();
      expect(stepIssue.details.expected).toBe(3);
      expect(stepIssue.details.actual).toBe(2);
    });

    it('bắt lỗi TOPIC_ABSENT khi nội dung lạc đề hoàn toàn', () => {
      const script = {
        nodes: [
          {
            id: 'node_send_1',
            nodeSubtype: 'send_email',
            config: {
              emailSubject: 'Thông báo sửa chữa đường ống nước',
              emailBody: '<p>Khu vực A sẽ cúp nước từ 8h đến 12h.</p>',
            },
          },
        ],
      };

      const result = scoreGeneratedContent(script, {
        topic: 'khóa học marketing online',
      });

      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.code === 'TOPIC_ABSENT')).toBe(true);
    });

    it('bắt lỗi PLACEHOLDER_UNRESOLVED khi có biến tùy biến không giải được', () => {
      const script = {
        nodes: [
          {
            id: 'node_send_1',
            nodeSubtype: 'send_email',
            config: {
              emailSubject: 'Quà tặng dành cho {{full_name}}',
              emailBody: '<p>Mã voucher đặc biệt của bạn là {{voucher_code}}</p>',
              templateMappings: [],
            },
          },
        ],
      };

      const result = scoreGeneratedContent(script);
      expect(result.ok).toBe(false);
      const pIssue = result.issues.find((i) => i.code === 'PLACEHOLDER_UNRESOLVED');
      expect(pIssue).toBeDefined();
      expect(pIssue.details.unresolved).toEqual(['voucher_code']);
    });
  });

  describe('scoreGeneratedContent (Zalo Channels)', () => {
    it('chấm điểm chính xác cho send_zalo_personal', () => {
      const script = {
        nodes: [
          {
            id: 'node_zalo_1',
            nodeSubtype: 'send_zalo_personal',
            config: {
              zaloPersonalTemplateSteps: [
                { message: 'Chào {{full_name}}, mã đơn hàng là {{order_id}}.' },
              ],
              templateMappings: [],
            },
          },
        ],
      };

      const result = scoreGeneratedContent(script, { locale: 'vi' });
      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.code === 'PLACEHOLDER_UNRESOLVED')).toBe(true);
      expect(result.issues.some((i) => i.code === 'EMPTY_BODY')).toBe(false);
    });

    it('chấm điểm chính xác cho send_zalo_group', () => {
      const script = {
        nodes: [
          {
            id: 'node_group_1',
            nodeSubtype: 'send_zalo_group',
            config: {
              zaloGroupTemplateSteps: [
                { message: 'Xin chào cả nhóm! Chúc mừng tuần mới.' },
              ],
            },
          },
        ],
      };

      const result = scoreGeneratedContent(script, {
        locale: 'vi',
        topic: 'chúc mừng tuần mới',
        schedule: { mode: 'once' },
      });

      expect(result.ok).toBe(true);
      expect(result.issues).toEqual([]);
    });

    it('bắt lỗi EMPTY_BODY cho Zalo khi message rỗng', () => {
      const script = {
        nodes: [
          {
            id: 'node_zalo_empty',
            nodeSubtype: 'send_zalo_personal',
            config: {
              messageText: '   ',
            },
          },
        ],
      };

      const result = scoreGeneratedContent(script);
      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.code === 'EMPTY_BODY')).toBe(true);
    });
  });
});
