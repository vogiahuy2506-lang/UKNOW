import { describe, expect, it } from '@jest/globals';
import { mergeCompiledWithContent } from '../campaignScriptMerge.service.js';

describe('Việc 4: mergeCompiledWithContent bảo toàn attachments', () => {
  const compilerFile = {
    key: 'campaigns/files/tailieu_compiler.pdf',
    name: 'tailieu_compiler.pdf',
    size: 50000,
    contentType: 'application/pdf',
  };

  const legacyFile = {
    key: 'campaigns/files/tailieu_legacy.pdf',
    name: 'tailieu_legacy.pdf',
    size: 20000,
    contentType: 'application/pdf',
  };

  it('sau khi ghép, send_zalo_group VẪN CÒN attachments do compiler đặt vào và nội dung từ legacy', () => {
    const compiledGraph = {
      nodes: [
        {
          id: 'send_1',
          nodeType: 'action',
          nodeSubtype: 'send_zalo_group',
          config: {
            zaloGroupTemplateSteps: [
              {
                templateId: null,
                message: '',
                attachments: [compilerFile],
              },
            ],
          },
        },
      ],
      connections: [],
    };

    const legacyScript = {
      nodes: [
        {
          nodeType: 'action',
          nodeSubtype: 'send_zalo_group',
          config: {
            zaloGroupTemplateSteps: [
              {
                templateId: 10,
                message: '📢 Xin chào nhóm Zalo từ LLM!',
              },
            ],
          },
        },
      ],
    };

    const { script, unmatchedSlots } = mergeCompiledWithContent(compiledGraph, legacyScript);
    expect(unmatchedSlots).toHaveLength(0);

    const mergedNode = script.nodes.find((n) => n.nodeSubtype === 'send_zalo_group');
    const step = mergedNode.config.zaloGroupTemplateSteps[0];

    // Nội dung được lấy từ legacy
    expect(step.message).toBe('📢 Xin chào nhóm Zalo từ LLM!');
    expect(step.templateId).toBe(10);
    // Attachments từ compiler được bảo toàn hoàn hảo
    expect(step.attachments).toEqual([compilerFile]);
  });

  it('ưu tiên attachments từ compiler khi cả compiler và legacy đều có', () => {
    const compiledGraph = {
      nodes: [
        {
          id: 'send_1',
          nodeType: 'action',
          nodeSubtype: 'send_zalo_group',
          config: {
            zaloGroupTemplateSteps: [
              {
                message: '',
                attachments: [compilerFile],
              },
            ],
          },
        },
      ],
      connections: [],
    };

    const legacyScript = {
      nodes: [
        {
          nodeType: 'action',
          nodeSubtype: 'send_zalo_group',
          config: {
            zaloGroupTemplateSteps: [
              {
                message: 'Thông báo',
                attachments: [legacyFile],
              },
            ],
          },
        },
      ],
    };

    const { script } = mergeCompiledWithContent(compiledGraph, legacyScript);
    const step = script.nodes[0].config.zaloGroupTemplateSteps[0];
    expect(step.attachments).toEqual([compilerFile]);
  });

  it('fallback lấy attachments từ legacy khi compiler không có attachments', () => {
    const compiledGraph = {
      nodes: [
        {
          id: 'send_1',
          nodeType: 'action',
          nodeSubtype: 'send_email',
          config: {
            emailSteps: [
              {
                emailSubject: '',
                emailBody: '',
              },
            ],
          },
        },
      ],
      connections: [],
    };

    const legacyScript = {
      nodes: [
        {
          nodeType: 'action',
          nodeSubtype: 'send_email',
          config: {
            emailSteps: [
              {
                emailSubject: 'Tiêu đề email',
                emailBody: '<p>Nội dung email</p>',
                attachments: [legacyFile],
              },
            ],
          },
        },
      ],
    };

    const { script } = mergeCompiledWithContent(compiledGraph, legacyScript);
    const step = script.nodes[0].config.emailSteps[0];
    expect(step.emailSubject).toBe('Tiêu đề email');
    expect(step.attachments).toEqual([legacyFile]);
  });
});
