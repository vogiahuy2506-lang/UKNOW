import { describe, it, expect, jest } from '@jest/globals';
import {
  extractTemplateVariableNames,
  renderTemplateText,
  mapVariableToSemanticTarget,
  deriveVariablesForText,
  renderAutoMappedTemplateText,
} from '../templateVariableAutoMap.util.js';

describe('templateVariableAutoMap.util', () => {
  describe('extractTemplateVariableNames', () => {
    it('returns empty array when text is null, undefined, or contains no variables', () => {
      expect(extractTemplateVariableNames(null)).toEqual([]);
      expect(extractTemplateVariableNames('')).toEqual([]);
      expect(extractTemplateVariableNames('Xin chào quý khách!')).toEqual([]);
    });

    it('extracts unique variable names from template text', () => {
      const text = 'Chào {{full_name}}! Mã của {{ full_name }} là {{code_123}} và {{note.detail}}.';
      const vars = extractTemplateVariableNames(text);
      expect(vars).toEqual(['full_name', 'code_123', 'note.detail']);
    });
  });

  describe('renderTemplateText', () => {
    it('replaces known variables and replaces missing variables with empty string', () => {
      const text = 'Chào {{full_name}}! Email: {{email}}, Mã: {{code}}.';
      const rendered = renderTemplateText(text, { full_name: 'Nguyễn Hoàng Phúc', email: 'phuc@example.com' });
      expect(rendered).toBe('Chào Nguyễn Hoàng Phúc! Email: phuc@example.com, Mã: .');
    });
  });

  describe('mapVariableToSemanticTarget', () => {
    it('maps name variations to name target', () => {
      expect(mapVariableToSemanticTarget('full_name')).toBe('name');
      expect(mapVariableToSemanticTarget('fullname')).toBe('name');
      expect(mapVariableToSemanticTarget('ten')).toBe('name');
      expect(mapVariableToSemanticTarget('ho_ten')).toBe('name');
      expect(mapVariableToSemanticTarget('ho_va_ten')).toBe('name');
      expect(mapVariableToSemanticTarget('customer_name')).toBe('name');
    });

    it('maps email variations to email target', () => {
      expect(mapVariableToSemanticTarget('email')).toBe('email');
      expect(mapVariableToSemanticTarget('mail')).toBe('email');
      expect(mapVariableToSemanticTarget('dia_chi_email')).toBe('email');
    });

    it('maps phone variations to phone target', () => {
      expect(mapVariableToSemanticTarget('phone')).toBe('phone');
      expect(mapVariableToSemanticTarget('sdt')).toBe('phone');
      expect(mapVariableToSemanticTarget('so_dien_thoai')).toBe('phone');
      expect(mapVariableToSemanticTarget('dien_thoai')).toBe('phone');
    });

    it('returns null for unknown target variables', () => {
      expect(mapVariableToSemanticTarget('tour_name')).toBeNull();
      expect(mapVariableToSemanticTarget('discount_code')).toBeNull();
    });
  });

  describe('deriveVariablesForText', () => {
    it('Rule 1: Preserves existing mappings behavior when mappings array is non-empty (no regression)', () => {
      const customResolve = jest.fn().mockReturnValue({ full_name: 'Resolved From Mapping' });
      const mappings = [{ key: 'full_name', sourceType: 'manual', value: 'Resolved From Mapping' }];

      const result = deriveVariablesForText('Chào {{full_name}}!', {
        mappings,
        entry: { row: { full_name: 'Ignored Direct Row Value' } },
        resolveFromMappings: customResolve,
      });

      expect(customResolve).toHaveBeenCalledTimes(1);
      expect(result.variables).toEqual({ full_name: 'Resolved From Mapping' });
      expect(result.unresolved).toEqual([]);
    });

    it('Finding 1: Falls back to semantic match when explicit resolver returns empty or unresolved value', () => {
      // Mapping trỏ vào cột 'full_name' không tồn tại trong sheet (chỉ có 'Họ tên')
      const customResolve = jest.fn().mockReturnValue({ full_name: '' });
      const mappings = [{ key: 'full_name', sourceType: 'node', nodeId: 'n2', field: 'full_name' }];

      const result = deriveVariablesForText('Chào {{full_name}}!', {
        mappings,
        entry: { row: { 'Họ tên': 'Trần Thị B' } },
        resolveFromMappings: customResolve,
      });

      expect(customResolve).toHaveBeenCalledTimes(1);
      expect(result.variables.full_name).toBe('Trần Thị B');
      expect(result.unresolved).toEqual([]);
    });

    it('Finding 2: Throws Error when mappings array is non-empty but resolveFromMappings is missing', () => {
      const mappings = [{ key: 'full_name', sourceType: 'manual', value: 'Test' }];
      expect(() => {
        deriveVariablesForText('Chào {{full_name}}!', {
          mappings,
          entry: { row: { 'Họ tên': 'Trần Thị B' } },
        });
      }).toThrow('deriveVariablesForText: resolveFromMappings function is required when mappings array is non-empty');
    });

    it('Rule 2a: Auto-maps exact matching keys when mappings is empty', () => {
      const result = deriveVariablesForText('Chào {{full_name}}! Mã: {{customer_id}}', {
        mappings: [],
        entry: { row: { full_name: 'Nguyễn Hoàng Phúc', customer_id: 12345 } },
      });

      expect(result.variables).toEqual({
        full_name: 'Nguyễn Hoàng Phúc',
        customer_id: '12345',
      });
      expect(result.unresolved).toEqual([]);
    });

    it('Rule 2b: Auto-maps Vietnamese accented headers via foldDiacritics semantic matching', () => {
      // Case 1: Header 'Họ tên' with variable {{full_name}}
      const res1 = deriveVariablesForText('Chào {{full_name}}!', {
        mappings: [],
        entry: { row: { 'Họ tên': 'Nguyễn Hoàng Phúc' } },
      });
      expect(res1.variables.full_name).toBe('Nguyễn Hoàng Phúc');

      // Case 2: Header 'Họ và tên' with variable {{ten}}
      const res2 = deriveVariablesForText('Chào {{ten}}!', {
        mappings: [],
        entry: { row: { 'Họ và tên': 'Trần Văn An' } },
      });
      expect(res2.variables.ten).toBe('Trần Văn An');

      // Case 3: Header 'SĐT' with variable {{phone}}
      const res3 = deriveVariablesForText('Số: {{phone}}', {
        mappings: [],
        entry: { row: { SĐT: '0901234567' } },
      });
      expect(res3.variables.phone).toBe('0901234567');

      // Case 4: Header 'Địa chỉ Email' with variable {{email}}
      const res4 = deriveVariablesForText('Thư: {{email}}', {
        mappings: [],
        entry: { row: { 'Địa chỉ Email': 'an@example.com' } },
      });
      expect(res4.variables.email).toBe('an@example.com');
    });

    it('Rule 2c: Populates unresolved and sets empty string for unmatchable variables (or "bạn" for unresolvable name variables)', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const result = deriveVariablesForText('Tour: {{tour_name}} - Khách: {{full_name}}', {
        mappings: [],
        entry: { row: { full_name: 'Nguyễn Hoàng Phúc' } },
        logContext: { runId: 10, nodeId: 'n3', stepIndex: 0 },
      });

      expect(result.variables).toEqual({
        tour_name: '',
        full_name: 'Nguyễn Hoàng Phúc',
      });
      expect(result.unresolved).toEqual(['tour_name']);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[TemplateAutoMap] Unresolved template variables [tour_name]')
      );
      warnSpy.mockRestore();
    });

    it('Safety Net: Fallbacks to "bạn" for unresolvable name variables when entry has no name data (e.g. manual phones)', () => {
      const result = deriveVariablesForText('Chào {{full_name}}! Giá: {{product_price}}', {
        mappings: [],
        entry: { row: { phone: '0844790999' } },
      });

      expect(result.variables.full_name).toBe('bạn');
      expect(result.variables.product_price).toBe('');
      expect(result.unresolved).toEqual(['full_name', 'product_price']);

      const rendered = renderAutoMappedTemplateText('Chào {{full_name}}! Giá: {{product_price}}', {
        mappings: [],
        entry: { row: { phone: '0844790999' } },
      });
      expect(rendered).toBe('Chào bạn! Giá: ');
    });

    it('Rule 3: Returns empty variables without processing if text has no variables', () => {
      const result = deriveVariablesForText('Thông báo không có biến', {
        mappings: [],
        entry: { row: { full_name: 'Phúc' } },
      });
      expect(result.variables).toEqual({});
      expect(result.unresolved).toEqual([]);
    });
  });

  describe('renderAutoMappedTemplateText', () => {
    it('end-to-end: renders message with auto-mapped variables', () => {
      const rendered = renderAutoMappedTemplateText('Chào {{full_name}}! SĐT bạn là {{phone}}.', {
        mappings: [],
        entry: { row: { 'Họ và tên': 'Nguyễn Hoàng Phúc', SĐT: '0901234567' } },
      });
      expect(rendered).toBe('Chào Nguyễn Hoàng Phúc! SĐT bạn là 0901234567.');
    });
  });
});
