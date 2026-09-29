/**
 * P5 (PLAN_TG_WA_DAY_DU_2026-09-29) - gui anh/tai lieu qua kenh adapter (Telegram, WhatsApp).
 *
 * Dung CHUNG cho chien dich (sendOne), gui nhanh va Hop thu. Chi chua phan THUAN + dieu phoi thu tu gui;
 * viec gui that (mtcute / Baileys) do adapter truyen vao qua `sendText/sendImage/sendDocument`.
 *
 * THU TU GUI (chot - ghi ro de khong ai doan): tin CHU truoc (neu co), roi TUNG ANH (moi anh mot tin, theo thu tu
 * dinh kem), roi TUNG TAI LIEU (moi tep mot tin). Khong dung caption anh: caption bi cat/khong hien du o mot so
 * client, va bien {{ten}} da thay xong o text nen chu luon di nguyen ven.
 *
 * Nguon tep (`sources`) la ket qua `campaignZaloSender.prepareZaloAttachmentSources`:
 * `{ data: Buffer, filename: string, metadata: { totalSize } }`. Khoa luu tru KHONG bao gio di vao day - viec loc
 * theo chu workspace da lam o `prepareZaloAttachmentSources({ ownerUserId })`.
 */
import path from 'node:path';

/** Toi da bao nhieu ANH trong mot tin (mot lan gui). */
export const CHANNEL_MEDIA_MAX_IMAGES = 5;
/** Toi da bao nhieu TAI LIEU trong mot tin (mot lan gui). */
export const CHANNEL_MEDIA_MAX_DOCUMENTS = 3;
/**
 * Tong dung luong TAT CA tep cua mot tin. Muc chung an toan: Telegram cho 50 MB/tep, WhatsApp 16 MB anh / 100 MB
 * tai lieu - chon 20 MB de ca hai deu nhan duoc va bo nho tien trinh (mot tien trinh duy nhat) khong phong.
 */
export const CHANNEL_MEDIA_MAX_TOTAL_BYTES = 20 * 1024 * 1024;

/** Duoi tep duoc coi la ANH khi gui qua Telegram (sendPhoto nen; gif/webp/heic di duong tai lieu de khong mat dong/anh). */
export const TELEGRAM_PHOTO_EXTENSIONS = Object.freeze(['jpg', 'jpeg', 'png']);
/** Duoi tep duoc coi la ANH khi gui qua WhatsApp (`{ image }`; gif can `gifPlayback` nen di duong tai lieu). */
export const WHATSAPP_IMAGE_EXTENSIONS = Object.freeze(['jpg', 'jpeg', 'png', 'webp']);

const MIME_BY_EXTENSION = Object.freeze({
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  bmp: 'image/bmp',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip',
});

export const CHANNEL_MEDIA_LIMIT_ERROR_CODE = 'CHANNEL_MEDIA_LIMIT';

function limitError(message) {
  const err = new Error(message);
  err.code = CHANNEL_MEDIA_LIMIT_ERROR_CODE;
  return err;
}

/** Duoi tep chu thuong, khong dau cham ('' neu khong co). */
export function resolveExtension(fileName) {
  return path.extname(String(fileName || '')).replace('.', '').toLowerCase();
}

/** MIME theo duoi tep; khong biet thi 'application/octet-stream'. */
export function resolveMimeType(fileName) {
  return MIME_BY_EXTENSION[resolveExtension(fileName)] || 'application/octet-stream';
}

/**
 * Phan loai MOT nguon tep thanh 'image' hoac 'document' theo danh sach duoi anh cua kenh.
 * @param {{ filename?: string }} source
 * @param {readonly string[]} imageExtensions
 * @returns {'image'|'document'}
 */
export function classifyChannelAttachment(source, imageExtensions) {
  return imageExtensions.includes(resolveExtension(source?.filename)) ? 'image' : 'document';
}

function sizeOf(source) {
  if (Buffer.isBuffer(source?.data)) return source.data.length;
  const total = Number(source?.metadata?.totalSize);
  return Number.isFinite(total) ? total : 0;
}

/**
 * Chia nguon tep thanh anh / tai lieu (giu thu tu dinh kem trong moi nhom) va KIEM gioi han so luong + tong dung
 * luong. Nem loi (`code = CHANNEL_MEDIA_LIMIT`) TRUOC khi gui bat cu thu gi - khong bao gio gui nua chung roi moi
 * bao vuot han.
 *
 * @param {Array<{data?: Buffer, filename?: string, metadata?: {totalSize?: number}}>} sources
 * @param {readonly string[]} imageExtensions
 * @returns {{ images: Array<object>, documents: Array<object> }}
 */
export function planChannelMediaSend(sources, imageExtensions) {
  const list = Array.isArray(sources) ? sources.filter(Boolean) : [];
  const images = [];
  const documents = [];
  for (const source of list) {
    (classifyChannelAttachment(source, imageExtensions) === 'image' ? images : documents).push(source);
  }
  if (images.length > CHANNEL_MEDIA_MAX_IMAGES) {
    throw limitError(`Tối đa ${CHANNEL_MEDIA_MAX_IMAGES} ảnh mỗi tin nhắn.`);
  }
  if (documents.length > CHANNEL_MEDIA_MAX_DOCUMENTS) {
    throw limitError(`Tối đa ${CHANNEL_MEDIA_MAX_DOCUMENTS} tài liệu mỗi tin nhắn.`);
  }
  const totalBytes = list.reduce((sum, source) => sum + sizeOf(source), 0);
  if (totalBytes > CHANNEL_MEDIA_MAX_TOTAL_BYTES) {
    const mb = Math.round(CHANNEL_MEDIA_MAX_TOTAL_BYTES / (1024 * 1024));
    throw limitError(`Tổng dung lượng tệp đính kèm tối đa ${mb} MB mỗi tin nhắn.`);
  }
  return { images, documents };
}

/**
 * Kiem TINH (chua doc tep) so luong + dung luong khai bao cua danh sach dinh kem trong cau hinh node/yeu cau.
 * Dung o buoc san sang (preflight) de bao som thay vi de MOI nguoi nhan deu loi. Dung luong lay tu truong `size`
 * neu co (metadata tep trong kho media); thieu thi bo qua vế dung luong - vong gui van kiem lai bang byte that.
 *
 * @param {unknown} attachments
 * @param {readonly string[]} imageExtensions
 */
export function assertAttachmentListWithinLimits(attachments, imageExtensions) {
  const list = Array.isArray(attachments) ? attachments.filter(Boolean) : [];
  if (list.length === 0) return;
  const shaped = list.map((item) => ({
    filename: item?.filename || item?.displayName || item?.originalName || item?.name || item?.key || '',
    metadata: { totalSize: Number(item?.size) || 0 },
  }));
  planChannelMediaSend(shaped, imageExtensions);
}

/**
 * Danh sach dinh kem cua TUNG buoc trong `config.steps` cua node (chi lay mang, bo phan tu rong). Runner kenh adapter
 * chi truyen `stepIndex` (1-based) vao `sendOne`, nen adapter tu tra dinh kem cua buoc do qua `account.stepAttachments`
 * (dat luc `resolveAccount`) — khong phai sua runner.
 * @param {{ steps?: Array<{attachments?: unknown}> }} config
 * @returns {Array<Array<object>>}
 */
export function extractStepAttachments(config) {
  const steps = Array.isArray(config?.steps) ? config.steps : [];
  return steps.map((step) => (Array.isArray(step?.attachments) ? step.attachments.filter(Boolean) : []));
}

/**
 * Dinh kem cho MOT lan gui: tham so tuong minh (gui nhanh) THANG; khong co thi lay theo buoc cua node.
 * @param {{ account?: { stepAttachments?: Array<Array<object>> }, stepIndex?: number, attachments?: unknown }} input
 * @returns {Array<object>}
 */
export function resolveAttachmentsForSend({ account, stepIndex, attachments }) {
  if (Array.isArray(attachments)) return attachments.filter(Boolean);
  const index = Number.parseInt(stepIndex, 10) - 1;
  const perStep = account?.stepAttachments;
  return Number.isInteger(index) && index >= 0 && Array.isArray(perStep) && Array.isArray(perStep[index])
    ? perStep[index]
    : [];
}

/**
 * Chuan bi nguon tep tu metadata dinh kem (doc tu kho luu tru), LOC theo chu workspace.
 * Import tre `campaignZaloSender.service.js`: file do keo theo zca-js + hang loat phu thuoc; adapter Hop thu/Telegram
 * khong duoc nap chung khi chi dung Hop thu (khuon `telegramInbox.adapter.js`).
 *
 * @param {unknown} attachments
 * @param {{ ownerUserId: number|string, cache?: Map<string, any> }} options ownerUserId BAT BUOC
 * @returns {Promise<Array<{data: Buffer, filename: string, metadata: {totalSize: number}}>>}
 */
export async function prepareChannelAttachmentSources(attachments, { ownerUserId, cache } = {}) {
  const list = Array.isArray(attachments) ? attachments.filter(Boolean) : [];
  if (list.length === 0) return [];
  if (ownerUserId == null || String(ownerUserId).trim() === '') {
    // Khong co chu thi KHONG doc tep: prepareZaloAttachmentSources bo loc khi thieu ownerUserId.
    throw limitError('Không xác định được chủ workspace để đọc tệp đính kèm.');
  }
  const { default: campaignZaloSender } = await import('../services/campaign/campaignZaloSender.service.js');
  return campaignZaloSender.prepareZaloAttachmentSources(list, { ownerUserId, cache });
}

/**
 * Gui 1 tin gom text + anh + tai lieu qua kenh adapter theo thu tu da chot (xem dau file).
 *
 * Hop dong loi:
 * - Vuot gioi han -> NEM (code CHANNEL_MEDIA_LIMIT) truoc khi gui gi.
 * - Tin dau tien (chu, hoac tep dau neu khong co chu) that bai -> NEM loi goc (khach chua nhan gi).
 * - Loi o tin SAU tin dau -> DUNG, tra `{ sentCount, error }` (khach da nhan mot phan); khong nem, de nguoi goi
 *   quyet dinh: chien dich/gui nhanh coi la da gui (dem 1 nguoi = 1 luot), Hop thu bao "da gui mot phan".
 *
 * @param {object} input
 * @param {string} [input.text]
 * @param {Array<object>} [input.sources] ket qua prepareChannelAttachmentSources
 * @param {readonly string[]} input.imageExtensions
 * @param {(text: string) => Promise<{messageId?: string|number|null}>} input.sendText
 * @param {(file: {buffer: Buffer, fileName: string, mimeType: string}) => Promise<{messageId?: string|number|null}>} input.sendImage
 * @param {(file: {buffer: Buffer, fileName: string, mimeType: string}) => Promise<{messageId?: string|number|null}>} input.sendDocument
 * @returns {Promise<{ messageIds: string[], firstMessageId: string|null, sentCount: number, error: Error|null }>}
 */
export async function sendChannelMessageWithMedia({
  text = '',
  sources = [],
  imageExtensions,
  sendText,
  sendImage,
  sendDocument,
}) {
  const { images, documents } = planChannelMediaSend(sources, imageExtensions);
  const steps = [];
  if (String(text ?? '').trim() !== '') {
    steps.push(() => sendText(String(text)));
  }
  const toFile = (source) => ({
    buffer: source.data,
    fileName: source.filename || 'tep_dinh_kem',
    mimeType: resolveMimeType(source.filename),
  });
  for (const source of images) steps.push(() => sendImage(toFile(source)));
  for (const source of documents) steps.push(() => sendDocument(toFile(source)));

  const messageIds = [];
  let error = null;
  for (let index = 0; index < steps.length; index += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await steps[index]();
      const id = result?.messageId ?? result?.data?.messageId ?? null;
      messageIds.push(id == null ? null : String(id));
    } catch (err) {
      if (index === 0) throw err;
      error = err;
      break;
    }
  }
  const delivered = messageIds.length;
  const firstMessageId = messageIds.find((id) => id != null) ?? null;
  return {
    messageIds: messageIds.filter((id) => id != null),
    firstMessageId,
    sentCount: delivered,
    error,
  };
}
