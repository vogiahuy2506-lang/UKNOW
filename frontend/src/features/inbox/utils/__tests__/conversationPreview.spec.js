/**
 * H-08 — dòng xem trước: ảnh/tệp/video Zalo lưu dạng JSON trong content nên không được in URL thô.
 * Dữ liệu mẫu lấy theo production (ra-soat HOP_THU.md q22/q23).
 */
import { describe, it, expect } from 'vitest';
import { getConversationPreview, resolveMediaKind } from '../conversationPreview';

const LABELS = {
  image: '[Hình ảnh]', file: '[Tệp]', video: '[Video]', gif: '[GIF]', location: '[Vị trí]', voice: '[Tin nhắn thoại]',
  sticker: '[Sticker]', call: '[Cuộc gọi]', groupEvent: 'Sự kiện nhóm', link: 'Liên kết', zaloEvent: 'Sự kiện Zalo',
};

const photoJson = JSON.stringify({ title: '', description: '', href: 'https://photo-stal-3.zdn.vn/abc.jpg' });

describe('getConversationPreview — theo mã loại gốc của Zalo', () => {
  it('chat.photo → "[Hình ảnh]", KHÔNG có URL', () => {
    const text = getConversationPreview({ content: photoJson, rawType: 'chat.photo' }, LABELS);
    expect(text).toBe('[Hình ảnh]');
    expect(text).not.toContain('zdn.vn');
  });

  it('share.file → "[Tệp] tên-tệp" lấy từ title của thẻ JSON', () => {
    const content = JSON.stringify({ title: 'hop-dong.pdf', href: 'https://file.zdn.vn/x' });
    expect(getConversationPreview({ content, rawType: 'share.file' }, LABELS)).toBe('[Tệp] hop-dong.pdf');
  });

  it('share.file không có tên → chỉ "[Tệp]"', () => {
    expect(getConversationPreview({ content: JSON.stringify({ href: 'https://f.zdn.vn/x' }), rawType: 'share.file' }, LABELS)).toBe('[Tệp]');
  });

  it.each([
    ['chat.video.msg', '[Video]'],
    ['chat.gif', '[GIF]'],
    ['chat.location.new', '[Vị trí]'],
    ['chat.voice', '[Tin nhắn thoại]'],
  ])('%s → %s', (rawType, expected) => {
    expect(getConversationPreview({ content: photoJson, rawType }, LABELS)).toBe(expected);
  });

  it('cuộc gọi (title sendBubbleMessage) vẫn ra nhãn cuộc gọi như trước', () => {
    const content = JSON.stringify({ title: 'sendBubbleMessage', description: 'Cuộc gọi' });
    expect(getConversationPreview({ content }, LABELS)).toBe('[Cuộc gọi]');
  });
});

describe('getConversationPreview — loại đính kèm / loại tin / văn bản thường', () => {
  it('đính kèm ảnh (Telegram/WhatsApp/Web) và nội dung rỗng → "[Hình ảnh]"; loại lạ → "[Tệp]"', () => {
    expect(getConversationPreview({ content: '', attachmentType: 'image' }, LABELS)).toBe('[Hình ảnh]');
    expect(getConversationPreview({ content: '', attachmentType: 'photo' }, LABELS)).toBe('[Hình ảnh]');
    expect(getConversationPreview({ content: '', attachmentType: 'sticker' }, LABELS)).toBe('[Sticker]');
    expect(getConversationPreview({ content: '', attachmentType: 'application/pdf' }, LABELS)).toBe('[Tệp]');
  });

  it('tin SSE chỉ có messageType (image/file/sticker) cũng ra nhãn, không in nội dung JSON', () => {
    expect(getConversationPreview({ content: photoJson, messageType: 'image' }, LABELS)).toBe('[Hình ảnh]');
    expect(getConversationPreview({ content: '', messageType: 'file' }, LABELS)).toBe('[Tệp]');
  });

  it('văn bản thường giữ nguyên; rỗng thì trả rỗng (không hiện dòng xem trước)', () => {
    expect(getConversationPreview({ content: 'Dạ chạy được ạ' }, LABELS)).toBe('Dạ chạy được ạ');
    expect(getConversationPreview({ content: '' }, LABELS)).toBe('');
    expect(getConversationPreview({}, LABELS)).toBe('');
  });

  it('mã loại gốc ưu tiên hơn loại đính kèm và loại tin', () => {
    expect(resolveMediaKind({ rawType: 'chat.video.msg', attachmentType: 'image', messageType: 'file' })).toBe('video');
    expect(resolveMediaKind({ attachmentType: 'image', messageType: 'file' })).toBe('image');
    expect(resolveMediaKind({ messageType: 'text' })).toBeNull();
  });
});

describe('getConversationPreview — nhóm có tên người gửi', () => {
  it('nhóm + tin khách → "Hải: Dạ chạy được"', () => {
    expect(getConversationPreview({ content: 'Dạ chạy được', sender: 'Hải', isGroup: true, role: 'visitor' }, LABELS)).toBe('Hải: Dạ chạy được');
  });

  it('nhóm + ảnh → "Hải: [Hình ảnh]"', () => {
    expect(getConversationPreview({ content: photoJson, rawType: 'chat.photo', sender: 'Hải', isGroup: true }, LABELS)).toBe('Hải: [Hình ảnh]');
  });

  it('chat 1-1 không thêm tên người gửi; tin của mình (agent) trong nhóm cũng không', () => {
    expect(getConversationPreview({ content: 'xin chào', sender: 'Hải', isGroup: false, role: 'visitor' }, LABELS)).toBe('xin chào');
    expect(getConversationPreview({ content: 'ok', sender: 'Hải', isGroup: true, role: 'agent' }, LABELS)).toBe('ok');
  });
});
