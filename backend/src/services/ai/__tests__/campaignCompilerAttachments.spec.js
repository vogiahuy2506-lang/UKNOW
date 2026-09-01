import { describe, expect, it } from '@jest/globals';
import { compileCampaign } from '../campaignCompiler.service.js';

describe('Việc 3: Compiler đưa attachments vào config bước', () => {
  const dummyAttachment = {
    key: 'campaigns/1/catalogue.pdf',
    name: 'catalogue.pdf',
    size: 20480,
    contentType: 'application/pdf',
  };

  it('Zalo nhóm Once: đưa attachments vào zaloGroupTemplateSteps khi fileUsage là as_attachment hoặc both', () => {
    const intent = {
      version: 1,
      channel: 'zalo_group',
      sender: { type: 'zalo_account', id: 5 },
      audience: { type: 'zalo_contacts', recipientKind: 'phone' },
      schedule: { type: 'once' },
      fileUsage: 'as_attachment',
      attachments: [dummyAttachment],
    };

    const compiled = compileCampaign(intent);
    const sendNode = compiled.nodes.find((n) => n.nodeSubtype === 'send_zalo_group');
    expect(sendNode).toBeDefined();
    expect(sendNode.config.zaloGroupTemplateSteps[0].attachments).toEqual([dummyAttachment]);
  });

  it('Zalo nhóm Drip: đưa attachments vào mọi bước zaloGroupTemplateSteps khi fileUsage là both', () => {
    const intent = {
      version: 1,
      channel: 'zalo_group',
      sender: { type: 'zalo_account', id: 5 },
      audience: { type: 'zalo_contacts', recipientKind: 'phone' },
      schedule: { type: 'drip', days: 2, slotsPerDay: 1 },
      fileUsage: 'both',
      attachments: [dummyAttachment],
    };

    const compiled = compileCampaign(intent);
    const sendNode = compiled.nodes.find((n) => n.nodeSubtype === 'send_zalo_group');
    expect(sendNode).toBeDefined();
    expect(sendNode.config.zaloGroupTemplateSteps).toHaveLength(2);
    expect(sendNode.config.zaloGroupTemplateSteps[0].attachments).toEqual([dummyAttachment]);
    expect(sendNode.config.zaloGroupTemplateSteps[1].attachments).toEqual([dummyAttachment]);
  });

  it('Zalo cá nhân Drip: đưa attachments vào mọi bước zaloPersonalTemplateSteps', () => {
    const intent = {
      version: 1,
      channel: 'zalo',
      sender: { type: 'zalo_account', id: 5 },
      audience: { type: 'zalo_contacts', friendIds: ['f1'] },
      schedule: { type: 'drip', days: 1, slotsPerDay: 2 },
      fileUsage: 'as_attachment',
      attachments: [dummyAttachment],
    };

    const compiled = compileCampaign(intent);
    const sendNode = compiled.nodes.find((n) => n.nodeSubtype === 'send_zalo_personal');
    expect(sendNode).toBeDefined();
    expect(sendNode.config.zaloPersonalTemplateSteps[0].attachments).toEqual([dummyAttachment]);
    expect(sendNode.config.zaloPersonalTemplateSteps[1].attachments).toEqual([dummyAttachment]);
  });

  it('Email Once: đưa attachments vào emailSteps', () => {
    const intent = {
      version: 1,
      channel: 'email',
      sender: { type: 'email_account', id: 1 },
      audience: { type: 'db', recipientKind: 'email' },
      schedule: { type: 'once' },
      fileUsage: 'both',
      attachments: [dummyAttachment],
    };

    const compiled = compileCampaign(intent);
    const sendNode = compiled.nodes.find((n) => n.nodeSubtype === 'send_email');
    expect(sendNode).toBeDefined();
    expect(sendNode.config.emailSteps[0].attachments).toEqual([dummyAttachment]);
  });

  it('Khi fileUsage là as_content, attachments KHÔNG được chèn vào các bước gửi', () => {
    const intent = {
      version: 1,
      channel: 'zalo_group',
      sender: { type: 'zalo_account', id: 5 },
      audience: { type: 'zalo_contacts', recipientKind: 'phone' },
      schedule: { type: 'once' },
      fileUsage: 'as_content',
      attachments: [dummyAttachment],
    };

    const compiled = compileCampaign(intent);
    const sendNode = compiled.nodes.find((n) => n.nodeSubtype === 'send_zalo_group');
    expect(sendNode.config.zaloGroupTemplateSteps[0].attachments).toBeUndefined();
  });
});
