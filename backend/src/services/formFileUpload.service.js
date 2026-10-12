import crypto from 'crypto';
import db from '../config/database.js';
import formFileUploadRepository from '../repositories/formFileUpload.repository.js';
import {
  acquireStorageQuotaLock,
  insertStorageObject,
  listLiveStorageObjectsByKeyPrefix,
  markStorageObjectDeleted,
} from '../repositories/storage.repository.js';
import { getStorageBackend } from './storage/storageBackend.js';
import {
  assertQuotaAvailable,
  getStorageUsage,
  StorageQuotaExceededError,
} from './storage/storageQuota.service.js';
import { markDeletedAfterUnlink } from './storage/storageObject.service.js';
import {
  FORM_FILE_HEAD_BYTES,
  FORM_FILE_KINDS,
  isDeclaredMimeAcceptable,
  isFormFileUploadEnabled,
  normalizeFormFileConfig,
  resolveFormFileKind,
  sanitizeUploadFileName,
  verifyFileSignature,
} from '../utils/formFileKinds.util.js';
import {
  createFormFileSkipToken,
  isValidFormFileSkipToken,
} from '../utils/formFileToken.util.js';
import { logError } from '../utils/logger.util.js';

/**
 * Trường `file` của biểu mẫu — nghiệp vụ tải tệp (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-4b, QĐ7).
 *
 * Luồng khách (3 bước), tệp đi THẲNG lên kho bằng URL ký (GCS) — không qua RAM backend:
 *   1. `createUploadSession`  : kiểm loại/cỡ/hạn mức → ghi phiên 'pending' (migration 300) → trả URL PUT (GCS) hoặc endpoint cục bộ.
 *   2. trình duyệt PUT tệp vào khoá tạm  uploads/<chủ>/forms/<form>/tmp/<uploadId>.<đuôi>
 *   3. nộp bài kèm uploadId: `verifyUploadsForSubmission` (không ghi gì; mọi lỗi 400 ở đây — trước khi có bài nộp) →
 *      `commitSubmissionFiles` (ghi sổ dung lượng của chủ + sao chép sang  .../submissions/<bài nộp>/<uuid>.<đuôi>) →
 *      INSERT bài nộp → `finalizeFileCommit` (xoá tệp tạm). INSERT lỗi thì `rollbackFileCommit` trả mọi thứ về trạng thái trước.
 *
 * Chủ hết dung lượng KHÔNG làm mất khách: xin URL trả `{ quotaExceeded, skipToken }` (không lỗi cứng), nộp bài vẫn nhận các ô khác,
 * trường tệp đánh dấu `fileStatus: 'quota_exceeded'` kể cả khi bắt buộc, chủ nhận chuông (tối đa 1 lần / biểu mẫu / giờ).
 */

/** URL ký PUT sống 15 phút (GCS kiểm hạn lúc request ĐẾN, nên tệp lớn đang tải dở không bị cắt). */
export const FORM_FILE_UPLOAD_URL_TTL_MS = 15 * 60 * 1000;
/** Phiên chờ nộp tối đa 24 giờ; quá hạn thì cron `form_file_upload_cleanup` xoá tệp tạm + dòng phiên. */
export const FORM_FILE_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const FORM_FILE_STORAGE_CATEGORY = 'form_file';
export const FORM_FILE_REFERENCE_TYPE = 'form_submission_file';
export const FORM_FILE_QUOTA_EVENT = 'form_file_quota_exceeded';

export const FILE_STATUS = Object.freeze({
  RECEIVED: 'received',
  QUOTA_EXCEEDED: 'quota_exceeded',
  FAILED: 'failed',
});

function httpError(message, statusCode = 400, code = 'BAD_REQUEST') {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

function ownerIdOf(form) {
  return Number(form.workspaceOwnerId);
}

/** Danh sách đuôi chủ cho phép, để báo cho khách ("jpg, png, pdf"). */
function describeAllowedExtensions(kinds) {
  return (kinds || []).flatMap((kind) => FORM_FILE_KINDS[kind]?.exts || []).join(', ');
}

/** Tiền tố khoá kho của MỌI tệp bài nộp của một biểu mẫu. */
export function buildSubmissionFilesPrefix({ ownerId, formId, submissionId = null }) {
  const base = `uploads/${ownerId}/forms/${formId}/submissions/`;
  return submissionId == null ? base : `${base}${submissionId}/`;
}

function buildTempObjectKey({ ownerId, formId, uploadId, ext }) {
  return `uploads/${ownerId}/forms/${formId}/tmp/${uploadId}.${ext}`;
}

// ─── Bước 1: xin URL tải lên ──────────────────────────────────────────────────────────────────────

/**
 * Báo chủ biểu mẫu "hết dung lượng": chuông (và email nếu super admin bật cho sự kiện này), TỐI ĐA 1 lần / biểu mẫu / giờ
 * (dedupeKey theo giờ VN — dispatcher chống trùng theo (người nhận, dedupeKey)). Không bao giờ ném lỗi ra đường khách.
 *
 * @param {{ id: number|string, workspaceOwnerId: number|string, title?: string }} form
 * @param {Date} [now]
 */
export async function notifyOwnerFileQuotaExceeded(form, now = new Date()) {
  try {
    // Nạp muộn: form.service.js import module này, mà dispatcher kéo theo systemEmail + 3 repository thông báo — không cần trên đường nộp
    // bài bình thường (chỉ khi chủ hết dung lượng), và nạp tĩnh sẽ buộc mọi spec mock systemEmail.util phải khai thêm export.
    const { notifyUsers } = await import('./notification/notificationDispatch.service.js');
    const hourKey = new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 13).replace(/\D/g, '');
    const title = String(form.title || '').slice(0, 120);
    await notifyUsers({
      eventType: FORM_FILE_QUOTA_EVENT,
      userIds: [ownerIdOf(form)],
      title: 'Hết dung lượng — biểu mẫu chưa nhận được tệp của khách',
      titleEn: 'Storage full — your form could not receive a customer file',
      message:
        `Biểu mẫu "${title}" vừa có khách đính kèm tệp nhưng tài khoản của bạn đã hết dung lượng lưu trữ nên tệp chưa được lưu. `
        + 'Thông tin ở các ô khác của khách vẫn được ghi nhận bình thường. Mua thêm dung lượng để nhận lại tệp của khách.',
      messageEn:
        `Your form "${title}" just got a customer file attachment, but your account is out of storage so the file was not saved. `
        + 'The customer\'s other answers were recorded normally. Buy more storage to receive customer files again.',
      link: '/app/topup',
      severity: 'warning',
      metadata: { formId: String(form.id), formTitle: title },
      dedupeKey: `form_file_quota:${form.id}:${hourKey}`,
    });
  } catch (error) {
    logError(`[FormFileUpload] Không báo được chủ biểu mẫu ${form.id} hết dung lượng: ${error?.message || error}`);
  }
}

/**
 * Xin URL tải tệp lên cho MỘT tệp của MỘT trường `file`.
 * Tiền điều kiện (form.service.js đã kiểm): biểu mẫu xuất bản, không bị khoá, chủ còn gói; cờ tính năng bật.
 *
 * @param {{ form: object, body: { fieldKey?: unknown, fileName?: unknown, size?: unknown, contentType?: unknown } }} params
 * @returns {Promise<
 *   { quotaExceeded: true, skipToken: string }
 *   | { uploadId: string, uploadUrl: string, method: string, headers: Record<string,string>, expiresAt: string, fileName: string }
 * >}
 */
export async function createUploadSession({ form, body = {} }) {
  const fieldKey = typeof body.fieldKey === 'string' ? body.fieldKey.trim() : '';
  const field = (Array.isArray(form.fields) ? form.fields : []).find((f) => f?.key === fieldKey && f.type === 'file');
  if (!field) {
    throw httpError('Trường tải tệp không tồn tại trong biểu mẫu', 400, 'INVALID_FIELD');
  }
  const config = normalizeFormFileConfig(field.fileConfig, field.label);

  const fileName = sanitizeUploadFileName(body.fileName);
  if (!fileName) {
    throw httpError('Tên tệp không hợp lệ', 400, 'INVALID_FILE_NAME');
  }
  const resolved = resolveFormFileKind(fileName, config.kinds);
  if (!resolved.ok) {
    if (resolved.reason === 'forbidden') {
      throw httpError('Loại tệp này không được phép tải lên', 400, 'FILE_TYPE_FORBIDDEN');
    }
    throw httpError(
      `Chỉ nhận các tệp: ${describeAllowedExtensions(config.kinds)}`,
      400,
      'FILE_TYPE_NOT_ALLOWED'
    );
  }
  if (!isDeclaredMimeAcceptable(body.contentType, resolved.ext)) {
    throw httpError(
      `Chỉ nhận các tệp: ${describeAllowedExtensions(config.kinds)}`,
      400,
      'FILE_TYPE_NOT_ALLOWED'
    );
  }

  const size = typeof body.size === 'number' ? body.size : Number(body.size);
  if (!Number.isSafeInteger(size) || size < 1) {
    throw httpError('Dung lượng tệp không hợp lệ', 400, 'INVALID_FILE_SIZE');
  }
  if (size > config.maxBytes) {
    throw httpError('Tệp vượt quá dung lượng tối đa cho phép', 400, 'FILE_TOO_LARGE');
  }

  const ownerId = ownerIdOf(form);

  // Hạn mức dung lượng của CHỦ (kể cả phần đã cấp cho các phiên khác còn chờ). Hết → KHÔNG lỗi cứng: trả dấu để khách vẫn nộp được.
  const [usage, pendingBytes] = await Promise.all([
    getStorageUsage(ownerId),
    formFileUploadRepository.sumPendingDeclaredBytes(ownerId),
  ]);
  try {
    assertQuotaAvailable({ usage: { ...usage, usedBytes: usage.usedBytes + pendingBytes }, requestedBytes: size });
  } catch (error) {
    if (!(error instanceof StorageQuotaExceededError)) throw error;
    void notifyOwnerFileQuotaExceeded(form);
    const { token } = createFormFileSkipToken({ formId: form.id, fieldKey });
    return { quotaExceeded: true, skipToken: token };
  }

  const uploadId = crypto.randomUUID();
  const objectKey = buildTempObjectKey({ ownerId, formId: form.id, uploadId, ext: resolved.ext });
  const target = await getStorageBackend().createUploadTarget({
    key: objectKey,
    contentType: resolved.mime,
    maxBytes: config.maxBytes,
    ttlMs: FORM_FILE_UPLOAD_URL_TTL_MS,
    fallbackPath: `/api/public/forms/${encodeURIComponent(form.publicKey)}/uploads/${uploadId}/content`,
  });

  await formFileUploadRepository.insert({
    id: uploadId,
    formId: form.id,
    workspaceOwnerId: ownerId,
    fieldKey,
    objectKey,
    fileName,
    fileExt: resolved.ext,
    contentType: resolved.mime,
    declaredSize: size,
    maxBytes: config.maxBytes,
    expiresAt: new Date(Date.now() + FORM_FILE_SESSION_TTL_MS),
  });

  return {
    uploadId,
    uploadUrl: target.uploadUrl,
    method: target.method,
    headers: target.headers,
    expiresAt: target.expiresAt,
    fileName,
  };
}

// ─── Bước 2 (chỉ kho cục bộ): nhận PUT ────────────────────────────────────────────────────────────

/**
 * Nhận byte của một phiên ở kho CỤC BỘ (máy dev/test; GCS không dùng đường này). Ghi dạng luồng, dừng khi vượt trần.
 *
 * @param {{ form: object, uploadId: string, contentType?: string, contentLength?: string|number, stream: import('stream').Readable }} params
 * @returns {Promise<{ size: number }>}
 */
export async function receiveLocalUpload({ form, uploadId, contentType, contentLength, stream }) {
  const backend = getStorageBackend();
  if (typeof backend.putStream !== 'function') {
    throw httpError('Không tìm thấy phiên tải lên', 404, 'UPLOAD_NOT_FOUND');
  }
  const session = await formFileUploadRepository.findById(uploadId);
  if (
    !session
    || String(session.formId) !== String(form.id)
    || session.status !== 'pending'
    || new Date(session.expiresAt).getTime() <= Date.now()
  ) {
    throw httpError('Không tìm thấy phiên tải lên', 404, 'UPLOAD_NOT_FOUND');
  }
  const declaredType = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (declaredType !== session.contentType) {
    throw httpError('Content-Type không khớp với phiên tải lên', 400, 'INVALID_CONTENT_TYPE');
  }
  const announced = Number(contentLength);
  if (Number.isFinite(announced) && announced > Number(session.maxBytes)) {
    throw httpError('Tệp vượt quá dung lượng tối đa cho phép', 413, 'FILE_TOO_LARGE');
  }

  let result;
  try {
    result = await backend.putStream(session.objectKey, stream, { maxBytes: Number(session.maxBytes) });
  } catch (error) {
    if (error?.code === 'FILE_TOO_LARGE') {
      throw httpError('Tệp vượt quá dung lượng tối đa cho phép', 413, 'FILE_TOO_LARGE');
    }
    throw error;
  }
  if (result.size < 1) {
    await backend.delete(session.objectKey).catch(() => {});
    throw httpError('Tệp rỗng', 400, 'INVALID_FILE_SIZE');
  }
  return result;
}

// ─── Bước 3: xác nhận lúc nộp bài ─────────────────────────────────────────────────────────────────

/**
 * Kiểm MỌI tệp khách gửi kèm bài nộp — KHÔNG ghi gì vào DB/kho (trừ xoá tệp tạm gian lận). Lỗi nào cũng 400 nêu rõ, ném TRƯỚC khi
 * có bài nộp nên không bao giờ để lại bài nộp nửa vời.
 *
 * Kiểm từng uploadId: thuộc đúng biểu mẫu + đúng trường, còn 'pending' và chưa hết hạn, loại tệp vẫn nằm trong nhóm chủ cho phép,
 * đối tượng có trên kho, cỡ THẬT (khách có thể khai gian) ≤ trần, chữ ký vài trăm byte đầu khớp đuôi.
 *
 * @param {{ form: object, fileInputs: Record<string, { field: object, uploadIds?: string[], skipToken?: string }> }} params
 * @returns {Promise<{
 *   items: Array<{ fieldKey: string, field: object, session: object, size: number, ext: string, contentType: string }>,
 *   skippedFieldKeys: string[],
 *   allUploadIds: string[],
 * }>}
 */
export async function verifyUploadsForSubmission({ form, fileInputs = {} }) {
  const backend = getStorageBackend();
  const items = [];
  const skippedFieldKeys = [];

  for (const [fieldKey, input] of Object.entries(fileInputs)) {
    const field = input.field;
    const config = normalizeFormFileConfig(field.fileConfig, field.label);

    if (!input.uploadIds || input.uploadIds.length === 0) {
      if (input.skipToken && isValidFormFileSkipToken(input.skipToken, { formId: form.id, fieldKey })) {
        skippedFieldKeys.push(fieldKey);
      } else if (field.required) {
        throw httpError(`Trường "${field.label}" là bắt buộc`, 400, 'INVALID_SUBMISSION');
      }
      continue;
    }

    const sessions = await formFileUploadRepository.findByIdsForForm(input.uploadIds, form.id);
    const byId = new Map(sessions.map((row) => [row.id, row]));
    for (const uploadId of input.uploadIds) {
      const session = byId.get(uploadId);
      if (
        !session
        || session.fieldKey !== fieldKey
        || session.status !== 'pending'
        || new Date(session.expiresAt).getTime() <= Date.now()
      ) {
        throw httpError(
          `Tệp đính kèm của trường "${field.label}" không hợp lệ hoặc đã hết hạn, vui lòng chọn tải lại`,
          400,
          'INVALID_UPLOAD'
        );
      }

      const resolved = resolveFormFileKind(session.fileName, config.kinds);
      if (!resolved.ok) {
        throw httpError(`Loại tệp "${session.fileName}" không được nhận ở trường "${field.label}"`, 400, 'FILE_TYPE_NOT_ALLOWED');
      }

      const info = await backend.getObjectInfo(session.objectKey);
      if (!info || info.size < 1) {
        throw httpError(`Tệp "${session.fileName}" chưa được tải lên xong, vui lòng tải lại`, 400, 'UPLOAD_INCOMPLETE');
      }
      // Cỡ THẬT, không phải cỡ khách khai lúc xin URL.
      if (info.size > config.maxBytes) {
        await backend.delete(session.objectKey).catch(() => {});
        throw httpError(`Tệp "${session.fileName}" vượt quá dung lượng tối đa cho phép`, 400, 'FILE_TOO_LARGE');
      }

      const head = await backend.readHead(session.objectKey, FORM_FILE_HEAD_BYTES);
      const signature = verifyFileSignature(resolved.ext, head);
      if (!signature.ok) {
        await backend.delete(session.objectKey).catch(() => {});
        throw httpError(
          `Nội dung tệp "${session.fileName}" không đúng định dạng .${resolved.ext}`,
          400,
          'INVALID_FILE_CONTENT'
        );
      }

      items.push({
        fieldKey,
        field,
        session,
        size: info.size,
        ext: resolved.ext,
        contentType: resolved.mime,
      });
    }
  }

  return { items, skippedFieldKeys, allUploadIds: items.map((item) => item.session.id) };
}

async function withQuotaTransaction(ownerId, requestedBytes, work) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await acquireStorageQuotaLock(client, ownerId);
    const usage = await getStorageUsage(ownerId, client);
    assertQuotaAvailable({ usage, requestedBytes });
    const value = await work(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Ghi tệp đã xác nhận vào CHỖ CỦA BÀI NỘP: (1) sổ dung lượng của chủ — kiểm hạn mức và chèn dòng trong MỘT giao dịch có khoá chủ,
 * (2) sao chép đối tượng tạm sang  uploads/<chủ>/forms/<form>/submissions/<bài nộp>/<uuid>.<đuôi> (giữ bản tạm tới khi INSERT bài
 * nộp xong — INSERT lỗi thì khách nộp lại được mà không phải tải lại tệp), (3) chiếm phiên ('used') để một uploadId không dùng được
 * hai lần.
 *
 * Trả `status` cho TẤT CẢ trường tệp của bài nộp (cùng một kết quả): 'received' | 'quota_exceeded' (chủ hết dung lượng) |
 * 'failed' (kho lỗi). Hai trạng thái sau KHÔNG ném lỗi — bài nộp vẫn được nhận, trường tệp đánh dấu chưa nhận được tệp.
 *
 * @param {{ form: object, submissionId: number|string, verified: Awaited<ReturnType<typeof verifyUploadsForSubmission>> }} params
 * @returns {Promise<{
 *   status: 'received'|'quota_exceeded'|'failed'|'none',
 *   answers: Record<string, object>,
 *   ledgerIds: string[],
 *   finalKeys: string[],
 *   claimedUploadIds: string[],
 *   tempKeys: string[],
 *   submissionId: string,
 * }>}
 */
export async function commitSubmissionFiles({ form, submissionId, verified }) {
  const backend = getStorageBackend();
  const ownerId = ownerIdOf(form);
  const { items, skippedFieldKeys } = verified;
  const result = {
    status: 'none',
    answers: {},
    ledgerIds: [],
    finalKeys: [],
    claimedUploadIds: [],
    tempKeys: items.map((item) => item.session.objectKey),
    submissionId: String(submissionId),
  };

  const fieldsWithUploads = [...new Set(items.map((item) => item.fieldKey))];
  const buildAnswer = (field, status, files = []) => ({
    label: field.label,
    type: 'file',
    value: files.map((file) => file.name),
    files,
    fileStatus: status,
  });

  // Trường bị bỏ qua vì chủ đã hết dung lượng lúc khách xin URL (dấu có chữ ký).
  for (const fieldKey of skippedFieldKeys) {
    const field = (form.fields || []).find((f) => f.key === fieldKey);
    if (field) result.answers[fieldKey] = buildAnswer(field, FILE_STATUS.QUOTA_EXCEEDED);
  }
  if (items.length === 0) {
    if (skippedFieldKeys.length > 0) result.status = FILE_STATUS.QUOTA_EXCEEDED;
    return result;
  }

  const prefix = buildSubmissionFilesPrefix({ ownerId, formId: form.id, submissionId });
  const planned = items.map((item) => ({
    ...item,
    finalKey: `${prefix}${crypto.randomUUID()}.${item.ext}`,
  }));
  const totalBytes = planned.reduce((sum, item) => sum + item.size, 0);

  const markAllFields = (status) => {
    for (const fieldKey of fieldsWithUploads) {
      const field = planned.find((item) => item.fieldKey === fieldKey).field;
      result.answers[fieldKey] = buildAnswer(field, status);
    }
    result.status = status;
  };

  // (1) Sổ dung lượng.
  let ledgerRows;
  try {
    ledgerRows = await withQuotaTransaction(ownerId, totalBytes, async (client) => {
      const rows = [];
      for (const item of planned) {
        rows.push(await insertStorageObject({
          poolType: 'workspace',
          ownerUserId: ownerId,
          actorUserId: ownerId,
          storageKey: item.finalKey,
          category: 'form_file', // = FORM_FILE_STORAGE_CATEGORY (viết literal để spec storageCategories.spec.js quét thấy)
          state: 'active',
          sizeBytes: item.size,
          referenceType: FORM_FILE_REFERENCE_TYPE,
          referenceId: String(submissionId),
        }, client));
      }
      return rows;
    });
  } catch (error) {
    if (!(error instanceof StorageQuotaExceededError)) throw error;
    markAllFields(FILE_STATUS.QUOTA_EXCEEDED);
    await claimUploads(verified.allUploadIds, submissionId, result);
    void notifyOwnerFileQuotaExceeded(form);
    return result;
  }
  result.ledgerIds = ledgerRows.map((row) => String(row.id));

  // (2) Sao chép sang chỗ của bài nộp.
  const copiedKeys = [];
  try {
    for (const item of planned) {
      await backend.copy(item.session.objectKey, item.finalKey);
      copiedKeys.push(item.finalKey);
    }
  } catch (error) {
    logError(`[FormFileUpload] Sao chép tệp bài nộp ${submissionId} (form ${form.id}) lỗi: ${error?.message || error}`);
    await backend.delete(copiedKeys).catch(() => {});
    await Promise.all(result.ledgerIds.map((id) => markStorageObjectDeleted(id).catch(() => {})));
    result.ledgerIds = [];
    markAllFields(FILE_STATUS.FAILED);
    return result;
  }
  result.finalKeys = copiedKeys;

  // (3) Chiếm phiên — một uploadId chỉ dùng được MỘT lần (hai bài nộp đua nhau: một bên thắng, bên kia bị từ chối).
  const claimed = await formFileUploadRepository.markUsed(verified.allUploadIds, submissionId);
  result.claimedUploadIds = claimed;
  if (claimed.length !== verified.allUploadIds.length) {
    await rollbackFileCommit(result);
    throw httpError('Tệp đính kèm đã được dùng cho một bài nộp khác, vui lòng chọn tải lại', 400, 'INVALID_UPLOAD');
  }

  const filesByField = new Map();
  planned.forEach((item, index) => {
    const list = filesByField.get(item.fieldKey) || [];
    list.push({
      name: item.session.fileName,
      size: item.size,
      contentType: item.contentType,
      storageKey: result.finalKeys[index],
    });
    filesByField.set(item.fieldKey, list);
  });
  for (const fieldKey of fieldsWithUploads) {
    const field = planned.find((item) => item.fieldKey === fieldKey).field;
    result.answers[fieldKey] = buildAnswer(field, FILE_STATUS.RECEIVED, filesByField.get(fieldKey));
  }
  result.status = FILE_STATUS.RECEIVED;
  return result;
}

/** Chiếm phiên cho nhánh KHÔNG ghi tệp (hết dung lượng / kho lỗi): tệp tạm bị bỏ, cron dọn nốt. */
async function claimUploads(uploadIds, submissionId, result) {
  try {
    result.claimedUploadIds = await formFileUploadRepository.markUsed(uploadIds, submissionId);
  } catch (error) {
    logError(`[FormFileUpload] Không chiếm được phiên tệp của bài nộp ${submissionId}: ${error?.message || error}`);
  }
}

/**
 * INSERT bài nộp LỖI sau khi đã `commitSubmissionFiles`: trả mọi thứ về như chưa có bài nộp — xoá bản sao ở chỗ bài nộp, xoá dòng sổ
 * dung lượng, nhả phiên về 'pending' (bản tạm vẫn còn) để khách nộp lại không phải tải tệp lại.
 *
 * @param {Awaited<ReturnType<typeof commitSubmissionFiles>>} commit
 */
export async function rollbackFileCommit(commit) {
  if (!commit) return;
  try {
    if (commit.finalKeys.length > 0) await getStorageBackend().delete(commit.finalKeys);
  } catch (error) {
    logError(`[FormFileUpload] Rollback: xoá bản sao tệp lỗi: ${error?.message || error}`);
  }
  await Promise.all(commit.ledgerIds.map((id) => markStorageObjectDeleted(id).catch((error) => {
    logError(`[FormFileUpload] Rollback: không đánh dấu xoá dòng sổ ${id}: ${error?.message || error}`);
  })));
  if (commit.claimedUploadIds.length > 0) {
    try {
      await db.query(
        `UPDATE form_file_uploads SET status = 'pending', submission_id = NULL, used_at = NULL
          WHERE id = ANY($1::uuid[]) AND submission_id = $2`,
        [commit.claimedUploadIds, commit.submissionId]
      );
    } catch (error) {
      logError(`[FormFileUpload] Rollback: không nhả phiên tải lên: ${error?.message || error}`);
    }
  }
}

/**
 * Bài nộp đã INSERT xong: xoá các đối tượng tạm (lỗi chỉ log — cron dọn nốt qua dòng phiên 'used').
 *
 * @param {Awaited<ReturnType<typeof commitSubmissionFiles>>} commit
 */
export async function finalizeFileCommit(commit) {
  if (!commit || commit.tempKeys.length === 0) return;
  try {
    await getStorageBackend().delete(commit.tempKeys);
  } catch (error) {
    logError(`[FormFileUpload] Không xoá được tệp tạm sau khi nộp bài: ${error?.message || error}`);
  }
}

// ─── Dọn dẹp / xoá ────────────────────────────────────────────────────────────────────────────────

/**
 * Dọn phiên tải lên: 'pending' đã hết hạn (khách tải mà không nộp) + 'used' đã cũ (nhặt tệp tạm còn sót). Xoá đối tượng tạm TRƯỚC,
 * dòng phiên SAU — lỗi xoá kho thì dòng vẫn còn để lượt sau thử lại.
 * Chạy trong lượt đối soát kho đêm (utils/scheduler.js, job `storage_objects_reconcile`): cùng họ việc "dọn đối tượng kho mồ côi" nên
 * không mở cron riêng. Dọn theo lô `limit`, tối đa `maxBatches` lô mỗi lượt (lô thiếu = hết việc).
 *
 * @param {{ now?: Date, limit?: number, maxBatches?: number }} [options]
 * @returns {Promise<{ scanned: number, expiredPending: number, usedRemoved: number }>}
 */
export async function cleanupFormFileUploads({ now = new Date(), limit = 200, maxBatches = 25 } = {}) {
  const backend = getStorageBackend();
  const total = { scanned: 0, expiredPending: 0, usedRemoved: 0 };
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const candidates = await formFileUploadRepository.listCleanupCandidates({ now, limit });
    if (candidates.length === 0) break;
    const removable = [];
    for (const row of candidates) {
      try {
        await backend.delete(row.objectKey);
        removable.push(row);
      } catch (error) {
        logError(`[FormFileUpload] Không xoá được tệp tạm ${row.objectKey}: ${error?.message || error}`);
      }
    }
    await formFileUploadRepository.deleteByIds(removable.map((row) => row.id));
    total.scanned += candidates.length;
    total.expiredPending += removable.filter((row) => row.status === 'pending').length;
    total.usedRemoved += removable.filter((row) => row.status === 'used').length;
    // Cả lô không xoá được dòng nào (kho hỏng) thì dừng, tránh quay vòng trên cùng lô; lô chưa đầy = hết việc.
    if (removable.length === 0 || candidates.length < limit) break;
  }
  return total;
}

/**
 * Gom mọi tệp gắn với MỘT biểu mẫu (tệp tạm + tệp đã nộp + dòng sổ dung lượng) TRƯỚC khi xoá biểu mẫu — sau khi FK CASCADE chạy
 * thì danh sách phiên biến mất nên phải đọc trước. Đưa kết quả cho `removeCollectedFormFiles` SAU khi DB đã xoá xong.
 *
 * @param {{ formId: number|string, ownerId: number|string }} params
 */
export async function collectFormFiles({ formId, ownerId }) {
  const [tempKeys, ledgerRows] = await Promise.all([
    formFileUploadRepository.listObjectKeysByForm(formId),
    listLiveStorageObjectsByKeyPrefix({
      ownerUserId: ownerId,
      keyPrefix: buildSubmissionFilesPrefix({ ownerId, formId }),
      category: FORM_FILE_STORAGE_CATEGORY,
    }),
  ]);
  return { tempKeys, storageKeys: ledgerRows.map((row) => row.storage_key) };
}

/**
 * Xoá thật các tệp đã gom: tệp tạm xoá thẳng, tệp bài nộp qua `markDeletedAfterUnlink` (xoá kho + đánh dấu dòng sổ 'deleted' = TRỪ
 * dung lượng; lỗi kho thì dòng thành 'cleanup_pending' để đối soát đêm thử lại). Không ném lỗi — xoá biểu mẫu đã thành công.
 *
 * @param {Awaited<ReturnType<typeof collectFormFiles>>} collected
 */
export async function removeCollectedFormFiles(collected) {
  if (!collected) return;
  if (collected.tempKeys.length > 0) {
    await getStorageBackend().delete(collected.tempKeys).catch((error) => {
      logError(`[FormFileUpload] Không xoá được tệp tạm của biểu mẫu đã xoá: ${error?.message || error}`);
    });
  }
  for (const storageKey of collected.storageKeys) {
    try {
      await markDeletedAfterUnlink({ storageKey });
    } catch (error) {
      logError(`[FormFileUpload] Không xoá được tệp ${storageKey} của biểu mẫu đã xoá: ${error?.message || error}`);
    }
  }
}

export default {
  isFormFileUploadEnabled,
  createUploadSession,
  receiveLocalUpload,
  verifyUploadsForSubmission,
  commitSubmissionFiles,
  rollbackFileCommit,
  finalizeFileCommit,
  cleanupFormFileUploads,
  collectFormFiles,
  removeCollectedFormFiles,
  notifyOwnerFileQuotaExceeded,
};
