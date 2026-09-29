/**
 * P5 (PLAN_TG_WA_DAY_DU) - util gui anh/tai lieu chung cho Telegram/WhatsApp:
 * thu tu gui, gioi han so luong/dung luong, loi giua chung.
 */
import { describe, it, expect, jest } from '@jest/globals';
import {
  CHANNEL_MEDIA_MAX_DOCUMENTS,
  CHANNEL_MEDIA_MAX_IMAGES,
  CHANNEL_MEDIA_MAX_TOTAL_BYTES,
  CHANNEL_MEDIA_LIMIT_ERROR_CODE,
  TELEGRAM_PHOTO_EXTENSIONS,
  WHATSAPP_IMAGE_EXTENSIONS,
  assertAttachmentListWithinLimits,
  classifyChannelAttachment,
  planChannelMediaSend,
  resolveMimeType,
  sendChannelMessageWithMedia,
} from '../channelMediaSend.util.js';

const src = (filename, bytes = 10) => ({ data: Buffer.alloc(bytes, 1), filename, metadata: { totalSize: bytes } });

function makeSenders(log, overrides = {}) {
  return {
    sendText: jest.fn(async (t) => { log.push(`text:${t}`); return { messageId: `t${log.length}` }; }),
    sendImage: jest.fn(async (f) => { log.push(`image:${f.fileName}`); return { messageId: `i${log.length}` }; }),
    sendDocument: jest.fn(async (f) => { log.push(`doc:${f.fileName}`); return { messageId: `d${log.length}` }; }),
    ...overrides,
  };
}

describe('phan loai + mime', () => {
  it('Telegram: chi jpg/jpeg/png la anh; gif/webp/pdf la tai lieu', () => {
    const kind = (name) => classifyChannelAttachment({ filename: name }, TELEGRAM_PHOTO_EXTENSIONS);
    expect(kind('a.JPG')).toBe('image');
    expect(kind('a.png')).toBe('image');
    expect(kind('a.gif')).toBe('document');
    expect(kind('a.webp')).toBe('document');
    expect(kind('a.pdf')).toBe('document');
  });

  it('WhatsApp: them webp la anh, gif van la tai lieu', () => {
    const kind = (name) => classifyChannelAttachment({ filename: name }, WHATSAPP_IMAGE_EXTENSIONS);
    expect(kind('a.webp')).toBe('image');
    expect(kind('a.gif')).toBe('document');
  });

  it('resolveMimeType theo duoi tep; la -> octet-stream', () => {
    expect(resolveMimeType('a.jpeg')).toBe('image/jpeg');
    expect(resolveMimeType('b.PDF')).toBe('application/pdf');
    expect(resolveMimeType('c.xyz')).toBe('application/octet-stream');
  });
});

describe('sendChannelMessageWithMedia - thu tu', () => {
  it('text truoc, roi TUNG anh, roi TUNG tai lieu (du dinh kem xen ke tai lieu truoc anh)', async () => {
    const log = [];
    const result = await sendChannelMessageWithMedia({
      text: 'Xin chao',
      sources: [src('bao-gia.pdf'), src('a.jpg'), src('hop-dong.docx'), src('b.png')],
      imageExtensions: TELEGRAM_PHOTO_EXTENSIONS,
      ...makeSenders(log),
    });
    expect(log).toEqual([
      'text:Xin chao',
      'image:a.jpg',
      'image:b.png',
      'doc:bao-gia.pdf',
      'doc:hop-dong.docx',
    ]);
    expect(result.sentCount).toBe(5);
    expect(result.error).toBeNull();
    expect(result.firstMessageId).toBe('t1');
    expect(result.messageIds).toHaveLength(5);
  });

  it('khong co chu -> khong gui tin chu, tin dau la anh dau', async () => {
    const log = [];
    const result = await sendChannelMessageWithMedia({
      text: '   ',
      sources: [src('a.jpg')],
      imageExtensions: TELEGRAM_PHOTO_EXTENSIONS,
      ...makeSenders(log),
    });
    expect(log).toEqual(['image:a.jpg']);
    expect(result.firstMessageId).toBe('i1');
  });

  it('chuyen dung mime + fileName + buffer cho tung tep', async () => {
    const log = [];
    const senders = makeSenders(log);
    const source = src('bao-gia.pdf', 5);
    await sendChannelMessageWithMedia({ text: '', sources: [source], imageExtensions: TELEGRAM_PHOTO_EXTENSIONS, ...senders });
    expect(senders.sendDocument).toHaveBeenCalledWith({
      buffer: source.data,
      fileName: 'bao-gia.pdf',
      mimeType: 'application/pdf',
    });
  });
});

describe('sendChannelMessageWithMedia - loi', () => {
  it('tin DAU (chu) loi -> nem loi goc, khong gui tep nao', async () => {
    const log = [];
    const senders = makeSenders(log, { sendText: jest.fn(async () => { throw new Error('FLOOD_WAIT_60'); }) });
    await expect(sendChannelMessageWithMedia({
      text: 'hi', sources: [src('a.jpg')], imageExtensions: TELEGRAM_PHOTO_EXTENSIONS, ...senders,
    })).rejects.toThrow('FLOOD_WAIT_60');
    expect(senders.sendImage).not.toHaveBeenCalled();
  });

  it('tep SAU tin dau loi -> khong nem, tra {sentCount, error} va dung lai (khong gui tiep)', async () => {
    const log = [];
    const senders = makeSenders(log, {
      sendImage: jest.fn(async () => { throw new Error('IMAGE_PROCESS_FAILED'); }),
    });
    const result = await sendChannelMessageWithMedia({
      text: 'hi',
      sources: [src('a.jpg'), src('b.pdf')],
      imageExtensions: TELEGRAM_PHOTO_EXTENSIONS,
      ...senders,
    });
    expect(result.sentCount).toBe(1);
    expect(result.error.message).toBe('IMAGE_PROCESS_FAILED');
    expect(result.firstMessageId).toBe('t1');
    expect(senders.sendDocument).not.toHaveBeenCalled();
  });

  it('khong co chu, tep dau loi -> nem (khach chua nhan gi)', async () => {
    const senders = makeSenders([], { sendImage: jest.fn(async () => { throw new Error('boom'); }) });
    await expect(sendChannelMessageWithMedia({
      text: '', sources: [src('a.jpg')], imageExtensions: TELEGRAM_PHOTO_EXTENSIONS, ...senders,
    })).rejects.toThrow('boom');
  });
});

describe('gioi han (P5)', () => {
  it('hang so ghim dung gia tri chot: 5 anh / 3 tai lieu / 20 MB', () => {
    expect(CHANNEL_MEDIA_MAX_IMAGES).toBe(5);
    expect(CHANNEL_MEDIA_MAX_DOCUMENTS).toBe(3);
    expect(CHANNEL_MEDIA_MAX_TOTAL_BYTES).toBe(20 * 1024 * 1024);
  });

  it('6 anh -> nem CHANNEL_MEDIA_LIMIT TRUOC khi gui gi', async () => {
    const senders = makeSenders([]);
    const sources = Array.from({ length: 6 }, (_, i) => src(`a${i}.jpg`));
    const err = await sendChannelMessageWithMedia({
      text: 'hi', sources, imageExtensions: TELEGRAM_PHOTO_EXTENSIONS, ...senders,
    }).catch((e) => e);
    expect(err.code).toBe(CHANNEL_MEDIA_LIMIT_ERROR_CODE);
    expect(senders.sendText).not.toHaveBeenCalled();
  });

  it('4 tai lieu -> nem', () => {
    const sources = Array.from({ length: 4 }, (_, i) => src(`d${i}.pdf`));
    expect(() => planChannelMediaSend(sources, TELEGRAM_PHOTO_EXTENSIONS)).toThrow(/tài liệu/);
  });

  it('dung 5 anh + 3 tai lieu van qua', () => {
    const sources = [
      ...Array.from({ length: 5 }, (_, i) => src(`a${i}.jpg`)),
      ...Array.from({ length: 3 }, (_, i) => src(`d${i}.pdf`)),
    ];
    const plan = planChannelMediaSend(sources, TELEGRAM_PHOTO_EXTENSIONS);
    expect(plan.images).toHaveLength(5);
    expect(plan.documents).toHaveLength(3);
  });

  it('tong dung luong > 20 MB -> nem; dung 20 MB thi qua', () => {
    const half = CHANNEL_MEDIA_MAX_TOTAL_BYTES / 2;
    expect(() => planChannelMediaSend(
      [src('a.pdf', half), src('b.pdf', half + 1)], TELEGRAM_PHOTO_EXTENSIONS
    )).toThrow(/MB/);
    expect(() => planChannelMediaSend(
      [src('a.pdf', half), src('b.pdf', half)], TELEGRAM_PHOTO_EXTENSIONS
    )).not.toThrow();
  });

  it('assertAttachmentListWithinLimits doc `size` khai bao trong metadata (chua doc tep)', () => {
    const big = { key: 'uploads/1/a.pdf', size: CHANNEL_MEDIA_MAX_TOTAL_BYTES + 1 };
    expect(() => assertAttachmentListWithinLimits([big], TELEGRAM_PHOTO_EXTENSIONS)).toThrow(/MB/);
    expect(() => assertAttachmentListWithinLimits([{ key: 'uploads/1/a.pdf' }], TELEGRAM_PHOTO_EXTENSIONS)).not.toThrow();
    expect(() => assertAttachmentListWithinLimits(undefined, TELEGRAM_PHOTO_EXTENSIONS)).not.toThrow();
  });
});
