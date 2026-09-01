import { describe, it, expect } from '@jest/globals';
import {
  deriveVariablesForText,
  renderAutoMappedTemplateText,
} from '../../../utils/templateVariableAutoMap.util.js';

describe('PR-1 Runtime Auto-Map Fallback Integration Spec', () => {
  describe('Zalo Personal & Group Runtime scenarios', () => {
    it('Scenario 1: Sheet has column full_name, mappings is empty, message contains {{full_name}} -> renders recipient name', () => {
      const entry = {
        row: {
          full_name: 'Nguyễn Hoàng Phúc',
          phone: '0901234567',
        },
      };
      const message = 'Chào {{full_name}}! Mình là Nhật Minh đây. 👋';

      const rendered = renderAutoMappedTemplateText(message, {
        mappings: [],
        entry,
      });

      expect(rendered).toBe('Chào Nguyễn Hoàng Phúc! Mình là Nhật Minh đây. 👋');
    });

    it('Scenario 2: Sheet has accented column "Họ và tên", mappings is empty -> foldDiacritics maps correctly', () => {
      const entry = {
        row: {
          'Họ và tên': 'Nguyễn Hoàng Phúc',
          'Số điện thoại': '0901234567',
        },
      };
      const message = 'Xin chào {{full_name}}! SĐT: {{phone}}';

      const rendered = renderAutoMappedTemplateText(message, {
        mappings: [],
        entry,
      });

      expect(rendered).toBe('Xin chào Nguyễn Hoàng Phúc! SĐT: 0901234567');
    });

    it('Scenario 3: Existing explicit mappings are preserved (no regression)', () => {
      const entry = {
        row: {
          full_name: 'Direct Row Name',
        },
      };
      const mappings = [
        {
          key: 'full_name',
          sourceType: 'manual',
          value: 'Tên Từ Mapping Thủ Công',
        },
      ];
      const message = 'Chào {{full_name}}!';

      const { variables } = deriveVariablesForText(message, {
        mappings,
        entry,
        resolveFromMappings: () => ({ full_name: 'Tên Từ Mapping Thủ Công' }),
      });

      expect(variables.full_name).toBe('Tên Từ Mapping Thủ Công');
    });

    it('Scenario 3b (Finding 1 Verification): Compiler sinh templateMappings trỏ field "full_name" nhưng Sheet dùng "Họ tên" -> Fallback giải đúng tên người nhận', () => {
      const entry = {
        row: {
          'Họ tên': 'Trần Thị B',
        },
      };
      // Resolver thực tế khi tra row['full_name'] sẽ ra undefined hoặc ''
      const resolveMock = ({ mappings, entry: ent }) => {
        const res = {};
        for (const m of mappings) {
          res[m.key] = ent?.row?.[m.field] || '';
        }
        return res;
      };
      const mappings = [
        {
          key: 'full_name',
          sourceType: 'node',
          nodeId: 'n2',
          field: 'full_name',
        },
      ];
      const message = 'Chào {{full_name}}!';

      const { variables } = deriveVariablesForText(message, {
        mappings,
        entry,
        resolveFromMappings: resolveMock,
      });

      expect(variables.full_name).toBe('Trần Thị B');
    });

    it('Scenario 4: Variable with no matching column replaces with empty string without error', () => {
      const entry = {
        row: {
          full_name: 'Nguyễn Hoàng Phúc',
        },
      };
      const message = 'Chào {{full_name}}! Chuyến đi {{tour_name}} đã sẵn sàng.';

      const rendered = renderAutoMappedTemplateText(message, {
        mappings: [],
        entry,
      });

      expect(rendered).toBe('Chào Nguyễn Hoàng Phúc! Chuyến đi  đã sẵn sàng.');
    });

    it('Scenario 5: Message without template variables returns original text', () => {
      const message = 'Thông báo chung gửi toàn thể khách hàng.';
      const rendered = renderAutoMappedTemplateText(message, {
        mappings: [],
        entry: { row: { full_name: 'Phúc' } },
      });
      expect(rendered).toBe(message);
    });
  });

  describe('Email Sender scenarios', () => {
    it('Scenario 6: Email with {{full_name}} in subject and htmlBody auto-maps from customer', () => {
      const customer = {
        full_name: 'Nguyễn Hoàng Phúc',
        email: 'phuc@example.com',
      };
      const subject = 'Ưu đãi dành cho {{full_name}}';
      const body = '<p>Chào {{full_name}}, email của bạn là {{email}}.</p>';

      const renderedSubject = renderAutoMappedTemplateText(subject, { customer });
      const renderedBody = renderAutoMappedTemplateText(body, { customer });

      expect(renderedSubject).toBe('Ưu đãi dành cho Nguyễn Hoàng Phúc');
      expect(renderedBody).toBe('<p>Chào Nguyễn Hoàng Phúc, email của bạn là phuc@example.com.</p>');
    });
  });
});
