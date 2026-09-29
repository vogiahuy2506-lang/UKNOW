import { describe, it, expect } from 'vitest';
import {
  CHANNEL_ATTACHMENT_LIMITS,
  CHANNEL_IMAGE_EXTENSIONS,
  applyTemplateToStep,
  classifyChannelAttachment,
  clearTemplateFromStep,
  getAttachmentDisplayName,
  validateChannelAttachments,
} from '../channelAttachments';
import { describeChannelAttachmentProblem } from '../nodeConfigModal.helpers';

/**
 * P5 — các hằng số PHẢN CHIẾU backend/src/utils/channelMediaSend.util.js (5 ảnh / 3 tài liệu / 20 MB;
 * Telegram chỉ jpg/jpeg/png là ảnh, WhatsApp thêm webp). Đổi một bên phải đổi bên kia — ca dưới ghim giá trị.
 */
describe('channelAttachments — giới hạn ghim theo backend', () => {
  it('5 ảnh / 3 tài liệu / 20 MB', () => {
    expect(CHANNEL_ATTACHMENT_LIMITS).toEqual({ maxImages: 5, maxDocuments: 3, maxTotalBytes: 20 * 1024 * 1024 });
  });

  it('đuôi ảnh theo kênh', () => {
    expect([...CHANNEL_IMAGE_EXTENSIONS.telegram]).toEqual(['jpg', 'jpeg', 'png']);
    expect([...CHANNEL_IMAGE_EXTENSIONS.whatsapp]).toEqual(['jpg', 'jpeg', 'png', 'webp']);
  });
});

describe('classifyChannelAttachment', () => {
  it('Telegram: webp là tài liệu; WhatsApp: webp là ảnh; gif luôn là tài liệu', () => {
    const webp = { name: 'a.WEBP' };
    expect(classifyChannelAttachment(webp, 'telegram')).toBe('document');
    expect(classifyChannelAttachment(webp, 'whatsapp')).toBe('image');
    expect(classifyChannelAttachment({ name: 'a.gif' }, 'whatsapp')).toBe('document');
    expect(classifyChannelAttachment({ originalName: 'x.jpg' }, 'telegram')).toBe('image');
    expect(classifyChannelAttachment({ key: 'uploads/1/x.pdf' }, 'telegram')).toBe('document');
  });

  it('tên hiển thị: displayName > originalName > name > tên trong key', () => {
    expect(getAttachmentDisplayName({ displayName: 'D', originalName: 'O', name: 'N' })).toBe('D');
    expect(getAttachmentDisplayName({ originalName: 'O', name: 'N' })).toBe('O');
    expect(getAttachmentDisplayName({ key: 'uploads/1/tep.pdf' })).toBe('tep.pdf');
  });
});

describe('validateChannelAttachments', () => {
  const imgs = (n) => Array.from({ length: n }, (_, i) => ({ name: `a${i}.jpg`, size: 10 }));
  const docs = (n) => Array.from({ length: n }, (_, i) => ({ name: `d${i}.pdf`, size: 10 }));

  it('hợp lệ (kể cả rỗng / không phải mảng) -> null', () => {
    expect(validateChannelAttachments([], 'telegram')).toBeNull();
    expect(validateChannelAttachments(undefined, 'telegram')).toBeNull();
    expect(validateChannelAttachments([...imgs(5), ...docs(3)], 'telegram')).toBeNull();
  });

  it('6 ảnh -> images; 4 tài liệu -> documents; quá dung lượng -> size', () => {
    expect(validateChannelAttachments(imgs(6), 'telegram')).toEqual({ code: 'images', limit: 5 });
    expect(validateChannelAttachments(docs(4), 'whatsapp')).toEqual({ code: 'documents', limit: 3 });
    expect(validateChannelAttachments([{ name: 'a.pdf', size: 21 * 1024 * 1024 }], 'telegram')).toEqual({ code: 'size', limit: 20 });
  });

  it('câu báo lỗi cho lúc lưu node', () => {
    expect(describeChannelAttachmentProblem(imgs(6), 'telegram')).toBe('Tối đa 5 ảnh mỗi tin nhắn.');
    expect(describeChannelAttachmentProblem(docs(4), 'telegram')).toBe('Tối đa 3 tài liệu mỗi tin nhắn.');
    expect(describeChannelAttachmentProblem([{ name: 'a.pdf', size: 30 * 1024 * 1024 }], 'telegram'))
      .toBe('Tổng dung lượng tệp đính kèm tối đa 20 MB mỗi tin nhắn.');
    expect(describeChannelAttachmentProblem(imgs(1), 'telegram')).toBe('');
  });
});

describe('applyTemplateToStep / clearTemplateFromStep', () => {
  it('điền nội dung + templateId + sao chép đính kèm; giữ trường khác của bước', () => {
    const attachments = [{ key: 'uploads/1/a.pdf', name: 'a.pdf' }];
    const next = applyTemplateToStep({ message: 'cũ', extra: 1 }, { id: 9, bodyText: 'Chào {{ten}}', attachments });
    expect(next).toEqual({ extra: 1, templateId: '9', message: 'Chào {{ten}}', attachments });
    expect(next.attachments).not.toBe(attachments); // bản sao, không tham chiếu mẫu
  });

  it('mẫu không có nội dung -> giữ nội dung đang soạn', () => {
    expect(applyTemplateToStep({ message: 'đang soạn' }, { id: 1, bodyText: '   ', attachments: [] }).message).toBe('đang soạn');
  });

  it('bỏ mẫu: giữ nội dung, xoá templateId + đính kèm', () => {
    expect(clearTemplateFromStep({ message: 'x', templateId: '9', attachments: [{ key: 'k' }] }))
      .toEqual({ message: 'x', templateId: '', attachments: [] });
  });
});
