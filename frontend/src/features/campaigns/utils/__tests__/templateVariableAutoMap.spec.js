import { describe, it, expect, vi } from 'vitest';
import {
  extractTemplateVariableNames,
  mapVariableToSemanticTarget,
  deriveVariablesForText,
  renderAutoMappedTemplateText,
  mergeVariablesPreferNonEmpty,
} from '../templateVariableAutoMap.js';

describe('PR-4: Frontend Template Variable Auto Map Spec', () => {
  describe('extractTemplateVariableNames', () => {
    it('extracts unique variable names from template text', () => {
      const text = 'Chào {{full_name}}! SĐT của {{full_name}} là {{phone}}.';
      const names = extractTemplateVariableNames(text);
      expect(names).toEqual(['full_name', 'phone']);
    });

    it('returns empty array when text has no variables or is invalid', () => {
      expect(extractTemplateVariableNames('')).toEqual([]);
      expect(extractTemplateVariableNames(null)).toEqual([]);
      expect(extractTemplateVariableNames('Xin chào không có biến')).toEqual([]);
    });
  });

  describe('mapVariableToSemanticTarget', () => {
    it('maps various name variable aliases to name', () => {
      expect(mapVariableToSemanticTarget('full_name')).toBe('name');
      expect(mapVariableToSemanticTarget('fullName')).toBe('name');
      expect(mapVariableToSemanticTarget('ho_ten')).toBe('name');
      expect(mapVariableToSemanticTarget('customer_name')).toBe('name');
    });

    it('maps various phone variable aliases to phone', () => {
      expect(mapVariableToSemanticTarget('phone')).toBe('phone');
      expect(mapVariableToSemanticTarget('sdt')).toBe('phone');
      expect(mapVariableToSemanticTarget('so_dien_thoai')).toBe('phone');
    });

    it('maps email variable aliases to email', () => {
      expect(mapVariableToSemanticTarget('email')).toBe('email');
      expect(mapVariableToSemanticTarget('mail')).toBe('email');
      expect(mapVariableToSemanticTarget('dia_chi_email')).toBe('email');
    });
  });

  describe('deriveVariablesForText & renderAutoMappedTemplateText', () => {
    it('Case 1: Auto-maps Vietnamese header "Họ tên" when mappings is empty', () => {
      const entry = { row: { 'Họ tên': 'Nguyễn Hoàng Phúc', 'SĐT': '0901234567' } };
      const templateText = 'Chào {{full_name}}! Số của bạn: {{phone}}.';

      const { variables, unresolved } = deriveVariablesForText(templateText, { entry });
      expect(variables).toEqual({
        full_name: 'Nguyễn Hoàng Phúc',
        phone: '0901234567',
      });
      expect(unresolved).toEqual([]);

      const rendered = renderAutoMappedTemplateText(templateText, { entry });
      expect(rendered).toBe('Chào Nguyễn Hoàng Phúc! Số của bạn: 0901234567.');
    });

    it('Case 2: Fallbacks to semantic match when explicit mappings resolver returns empty string (Finding 1)', () => {
      const entry = { row: { 'Họ và tên': 'Trần Thị B' } };
      const mappings = [{ key: 'full_name', field: 'full_name', sourceType: 'node' }];
      // Resolver tra đúng cột 'full_name' bị rỗng vì sheet dùng 'Họ và tên'
      const resolveFromMappings = () => ({ full_name: '' });

      const { variables } = deriveVariablesForText('Chào {{full_name}}!', {
        mappings,
        entry,
        resolveFromMappings,
      });

      expect(variables.full_name).toBe('Trần Thị B');
    });

    it('Case 3: Preserves valid explicit mapping value (no regression)', () => {
      const entry = { row: { 'Họ tên': 'Tên trong sheet' } };
      const mappings = [{ key: 'full_name', value: 'Tên chỉ định thủ công', sourceType: 'manual' }];
      const resolveFromMappings = () => ({ full_name: 'Tên chỉ định thủ công' });

      const { variables } = deriveVariablesForText('Chào {{full_name}}!', {
        mappings,
        entry,
        resolveFromMappings,
      });

      expect(variables.full_name).toBe('Tên chỉ định thủ công');
    });

    it('Case 4: Replaces unresolvable variable with empty string and logs warning (does not leave raw {{...}})', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const entry = { row: { 'Email': 'test@example.com' } };
      const templateText = 'Chào {{unknown_var}}!';

      const { variables, unresolved } = deriveVariablesForText(templateText, {
        entry,
        logContext: { nodeId: 'node_1', stepIndex: 1 },
      });

      expect(variables.unknown_var).toBe('');
      expect(unresolved).toEqual(['unknown_var']);

      const rendered = renderAutoMappedTemplateText(templateText, {
        entry,
        logContext: { nodeId: 'node_1', stepIndex: 1 },
      });
      expect(rendered).toBe('Chào !');
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('Case 5 (Regression): mergedVars has full_name but row uses custom header "Người nhận" -> finalVars retains "Nguyễn Văn A"', () => {
      const mergedVars = { full_name: 'Nguyễn Văn A' };
      const row = { 'Người nhận': 'Nguyễn Văn A' };
      const emailTemplateText = 'Chào {{full_name}}!';

      const { variables: autoVars } = deriveVariablesForText(emailTemplateText, {
        mappings: [],
        entry: { row },
        customer: row,
        resolveFromMappings: () => mergedVars,
      });

      // autoVars will be { full_name: '' } because mappings is empty and 'Người nhận' is not recognized
      expect(autoVars.full_name).toBe('');

      // Merging with priority for non-empty mergedVars via helper function:
      const finalVars = mergeVariablesPreferNonEmpty(autoVars, mergedVars);

      expect(finalVars.full_name).toBe('Nguyễn Văn A');
    });
  });
});
