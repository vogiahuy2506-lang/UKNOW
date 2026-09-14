import { describe, it, expect } from 'vitest';
import {
  findUnmappedVariables,
  validateNodeForRun,
} from '../campaignBuilderRunValidation';

describe('campaignBuilderRunValidation Spec (PR-3)', () => {
  describe('findUnmappedVariables', () => {
    it('detects unmapped variables in text', () => {
      const text = 'Chào {{full_name}}, mã {{code}}!';
      const mappings = [{ key: 'full_name', sourceType: 'node', nodeId: 'n2', field: 'full_name' }];
      const unmapped = findUnmappedVariables(text, mappings);
      expect(unmapped).toEqual(['code']);
    });

    it('returns empty array when all variables are mapped or text has no variables', () => {
      expect(findUnmappedVariables('Không có biến', [])).toEqual([]);
      expect(
        findUnmappedVariables('Chào {{full_name}}', [{ key: 'full_name' }])
      ).toEqual([]);
    });
  });

  describe('validateNodeForRun read_form_submissions (PR-6b)', () => {
    it('thiếu formId -> failed kèm câu báo', () => {
      const node = { type: 'read_form_submissions', data: { config: {} } };
      const res = validateNodeForRun(node);
      expect(res.status).toBe('failed');
      expect(res.message).toContain('biểu mẫu');
    });

    it('có formId, limit hợp lệ -> success', () => {
      const node = {
        type: 'read_form_submissions',
        data: { config: { formId: 9, formSubmissionsLimit: 500 } },
      };
      const res = validateNodeForRun(node);
      expect(res.status).toBe('success');
    });

    it('limit vượt trần -> failed', () => {
      const node = {
        type: 'read_form_submissions',
        data: { config: { formId: 9, formSubmissionsLimit: 999999 } },
      };
      const res = validateNodeForRun(node);
      expect(res.status).toBe('failed');
    });
  });

  describe('validateNodeForRun warnings for unmapped template variables', () => {
    it('attaches warning to Zalo personal action node without failing validation', () => {
      const node = {
        type: 'send_zalo_personal',
        data: {
          config: {
            zaloRecipientSource: 'node',
            zaloRecipientNodeId: 'n2',
            zaloRecipientField: 'phone',
            zaloPersonalTemplateSteps: [
              {
                templateId: 1,
                message: 'Chào {{full_name}}!',
                templateMappings: [],
              },
            ],
          },
        },
      };

      const res = validateNodeForRun(node);
      expect(res.status).toBe('success');
      expect(res.warning).toContain('full_name');
    });

    it('attaches warning to Email action node without failing validation', () => {
      const node = {
        type: 'send_email',
        data: {
          config: {
            fromEmailId: 1,
            recipientSource: 'node',
            recipientNodeId: 'n2',
            recipientField: 'email',
            emailSteps: [
              {
                templateId: 10,
                emailSubject: 'Ưu đãi {{full_name}}',
                emailBody: '<p>Nội dung</p>',
                templateMappings: [],
              },
            ],
          },
        },
      };

      const res = validateNodeForRun(node);
      expect(res.status).toBe('success');
      expect(res.warning).toContain('full_name');
    });
  });
});
