import { describe, it, expect } from 'vitest';
import { extractQuickSendDraftAttachments } from '../quickSendHandoff.js';

describe('Finding 3: Bàn giao sang Gửi nhanh (quickSendDraft) giữ được tệp từ compiler templateSteps', () => {
  const dummyAttachment = {
    key: 'uploads/1/tailieu.pdf',
    name: 'tailieu.pdf',
    size: 1024,
    contentType: 'application/pdf',
  };

  it('đọc attachments từ zaloGroupTemplateSteps[0].attachments', () => {
    const config = {
      zaloGroupTemplateSteps: [
        {
          message: 'Thông báo nhóm Zalo',
          attachments: [dummyAttachment],
        },
      ],
    };

    const attachments = extractQuickSendDraftAttachments(config);
    expect(attachments).toEqual([dummyAttachment]);
  });

  it('đọc attachments từ zaloPersonalTemplateSteps[0].attachments', () => {
    const config = {
      zaloPersonalTemplateSteps: [
        {
          message: 'Chào bạn',
          attachments: [dummyAttachment],
        },
      ],
    };

    const attachments = extractQuickSendDraftAttachments(config);
    expect(attachments).toEqual([dummyAttachment]);
  });

  it('đọc attachments từ emailSteps[0].attachments', () => {
    const config = {
      emailSteps: [
        {
          emailSubject: 'Tiêu đề email',
          emailBody: '<p>Nội dung</p>',
          attachments: [dummyAttachment],
        },
      ],
    };

    const attachments = extractQuickSendDraftAttachments(config);
    expect(attachments).toEqual([dummyAttachment]);
  });

  it('ưu tiên config.attachments cấp node nếu có', () => {
    const nodeAttachment = { key: 'uploads/1/node.pdf' };
    const stepAttachment = { key: 'uploads/1/step.pdf' };

    const config = {
      attachments: [nodeAttachment],
      emailSteps: [
        { attachments: [stepAttachment] },
      ],
    };

    const attachments = extractQuickSendDraftAttachments(config);
    expect(attachments).toEqual([nodeAttachment]);
  });

  it('fallback về singleStep.content.attachments khi config không có attachments', () => {
    const singleStep = {
      content: {
        attachments: [dummyAttachment],
      },
    };

    const attachments = extractQuickSendDraftAttachments({}, singleStep);
    expect(attachments).toEqual([dummyAttachment]);
  });

  it('trả về mảng rỗng khi không có attachment ở bất kỳ tầng nào', () => {
    expect(extractQuickSendDraftAttachments({}, null)).toEqual([]);
  });
});
