import { describe, it, expect } from 'vitest';
import { getSchemaForNodeId } from '../nodeConfigModalSchema';

describe('nodeConfigModalSchema - getSchemaForNodeId read_form_submissions (PR-6b)', () => {
  const buildSchemaFromRows = (rows) => {
    const first = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!first) return [];
    return Object.keys(first).map((key) => ({ key, type: typeof first[key] }));
  };

  it('chưa chạy thử (không có runLogMap) -> schema tĩnh có khoá cố định + khoá trong formColumnsSnapshot', () => {
    const nodes = [
      {
        id: 'n1',
        data: {
          nodeType: 'read_form_submissions',
          config: {
            formColumnsSnapshot: [
              { key: 'f_service', label: 'Dịch vụ', type: 'string' },
              { key: 'f_notes', label: 'Ghi chú', type: 'string' },
            ],
          },
        },
      },
    ];

    const schema = getSchemaForNodeId({ nodeId: 'n1', runLogMap: {}, nodes, buildSchemaFromRows });
    const keys = schema.map((s) => s.key);

    // Khoá cố định
    expect(keys).toEqual(
      expect.arrayContaining([
        'submissionId',
        'id',
        'formId',
        'fullName',
        'email',
        'phone',
        'appointmentAt',
        'createdAt',
        'marketingConsent',
      ])
    );
    // Khoá động từ formColumnsSnapshot
    expect(keys).toContain('f_service');
    expect(keys).toContain('f_notes');
  });

  it('không có formColumnsSnapshot -> vẫn trả đủ khoá cố định, không lỗi', () => {
    const nodes = [
      { id: 'n2', data: { nodeType: 'read_form_submissions', config: {} } },
    ];
    const schema = getSchemaForNodeId({ nodeId: 'n2', runLogMap: {}, nodes, buildSchemaFromRows });
    expect(schema.map((s) => s.key)).toContain('submissionId');
    expect(schema.length).toBe(9);
  });

  it('đã chạy thử (có runLogMap với output.schema) -> ưu tiên schema từ lần chạy thử, không dùng danh sách tĩnh', () => {
    const nodes = [
      { id: 'n3', data: { nodeType: 'read_form_submissions', config: {} } },
    ];
    const runLogMap = {
      n3: {
        result: {
          output: {
            items: [{ submissionId: 1, email: 'a@x.com' }],
            schema: [{ key: 'submissionId', type: 'number' }, { key: 'email', type: 'string' }],
          },
        },
      },
    };
    const schema = getSchemaForNodeId({ nodeId: 'n3', runLogMap, nodes, buildSchemaFromRows });
    expect(schema).toEqual([{ key: 'submissionId', type: 'number' }, { key: 'email', type: 'string' }]);
  });
});
