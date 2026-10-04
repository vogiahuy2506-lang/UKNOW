import * as mediaLibraryRepo from '../repositories/mediaLibrary.repository.js';
import uploadController from './upload.controller.js';
import { findStorageObjectById, markStorageObjectDeleted } from '../repositories/storage.repository.js';
import { markDeletedAfterUnlink } from '../services/storage/storageObject.service.js';
import { resolveStorageObjectsUsage } from '../services/storage/storageReference.service.js';
import { getWorkspaceContext } from '../utils/workspaceContext.util.js';
import { friendlyFileName } from '../utils/storageFileName.util.js';
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  logWorkspace,
} from '../services/audit.service.js';
import { getWorkspaceAuditContext } from '../utils/auditContext.util.js';

/**
 * Mọi phản hồi lỗi đều có `code` ổn định để frontend tự dịch theo ngôn ngữ người dùng (M-13); `message` tiếng Việt chỉ là
 * dự phòng cho client cũ/log. Lỗi 500 KHÔNG trả `err.message` ra ngoài (có thể lộ câu SQL / đường dẫn).
 */
export const MEDIA_ERROR_CODES = Object.freeze({
  LIST_FAILED: 'MEDIA_LIST_FAILED',
  ID_INVALID: 'MEDIA_ID_INVALID',
  NOT_FOUND: 'MEDIA_NOT_FOUND',
  DELETE_FAILED: 'MEDIA_DELETE_FAILED',
  REFERENCE_ALIVE: 'STORAGE_REFERENCE_ALIVE',
});

const toUsageInput = (item) => ({
  id: item.id,
  category: item.category,
  storageKey: item.storageKey,
  expiresAt: item.expiresAt,
  referenceType: item.referenceType,
  referenceId: item.referenceId,
});

/** Người xem là nhân viên → không thấy (và không xoá được) tệp Trợ lý AI do người khác tải lên: phiên trợ lý là riêng từng người. */
const viewerOf = (context) => ({
  restrictAssistantFiles: context.contextType === 'employee',
  actorUserId: context.actorUserId,
});

export async function listStorageObjects(req, res) {
  try {
    const context = getWorkspaceContext(req.user);
    const ownerUserId = context.workspaceOwnerId;
    const result = await mediaLibraryRepo.listWorkspaceStorageObjects(ownerUserId, req.query, viewerOf(context));
    // Cùng một hàm quyết định với nút Xoá: danh sách nói "đang dùng ở …" thì xoá sẽ bị chặn đúng chỗ đó, và ngược lại.
    const usage = await resolveStorageObjectsUsage(result.items.map(toUsageInput), ownerUserId);
    const data = result.items.map((item) => {
      const used = usage.get(String(item.id));
      return {
        ...item,
        inUse: Boolean(used?.inUse),
        usedBy: used?.inUse
          ? { referenceType: used.referenceType, referenceId: used.referenceId, label: used.label, name: used.name, url: used.url }
          : null,
      };
    });
    return res.json({
      success: true,
      data,
      categorySummary: result.categorySummary,
      pagination: result.pagination,
    });
  } catch (err) {
    console.error('[MediaLibrary] listStorageObjects error:', err);
    return res.status(500).json({ success: false, code: MEDIA_ERROR_CODES.LIST_FAILED, message: 'Lỗi tải danh sách tệp' });
  }
}

export async function deleteStorageObject(req, res) {
  try {
    const context = getWorkspaceContext(req.user);
    const ownerUserId = context.workspaceOwnerId;
    const objectId = Number(req.params.id);
    if (!Number.isSafeInteger(objectId) || objectId <= 0) {
      return res.status(400).json({ success: false, code: MEDIA_ERROR_CODES.ID_INVALID, message: 'ID tệp không hợp lệ' });
    }

    const object = await findStorageObjectById(objectId);
    if (!object || Number(object.owner_user_id) !== Number(ownerUserId) || object.pool_type !== 'workspace') {
      return res.status(404).json({ success: false, code: MEDIA_ERROR_CODES.NOT_FOUND, message: 'Không tìm thấy tệp' });
    }
    // Tệp mà danh sách đã ẩn khỏi nhân viên thì cũng không xoá được bằng cách gọi thẳng id — trả 404, không lộ là có tồn tại.
    if (context.contextType === 'employee'
      && await mediaLibraryRepo.isAssistantUploadOfOthers(object, context.actorUserId)) {
      return res.status(404).json({ success: false, code: MEDIA_ERROR_CODES.NOT_FOUND, message: 'Không tìm thấy tệp' });
    }

    if (object.state === 'deleted') {
      return res.json({ success: true, message: 'Tệp đã được xóa', data: { sizeBytes: 0 } });
    }

    // Một quyết định chung với danh sách (`resolveStorageObjectsUsage`): tệp tạm quá hạn, tệp chat, ảnh landing đã bị gỡ
    // khỏi trang đều xoá được; tệp còn nằm trong mẫu/landing/biểu mẫu… thì chặn 409.
    const usage = (await resolveStorageObjectsUsage([{
      id: object.id,
      category: object.category,
      storageKey: object.storage_key,
      expiresAt: object.expires_at,
      referenceType: object.reference_type,
      referenceId: object.reference_id,
    }], ownerUserId)).get(String(object.id));
    if (usage?.inUse) {
      const entityName = usage.name ? `"${usage.name}"` : usage.label;
      return res.status(409).json({
        success: false,
        code: MEDIA_ERROR_CODES.REFERENCE_ALIVE,
        message: `Tệp đang dùng ở ${usage.label} ${entityName}. Gỡ tệp khỏi đó trước rồi xóa.`,
        data: {
          referenceType: usage.referenceType,
          referenceId: usage.referenceId,
          referenceLabel: usage.label,
          referenceName: usage.name,
          url: usage.url,
        },
      });
    }

    // Delete storage object and update ledger
    if (object.storage_key) {
      const normalizedKey = uploadController.normalizeStorageKey(object.storage_key);
      await markDeletedAfterUnlink({
        storageKey: normalizedKey,
        keys: [normalizedKey, `${normalizedKey}.txt`].filter(Boolean),
      });
    } else if (object.temp_key) {
      let tempPath = null;
      try {
        tempPath = uploadController.resolveTempFilePath(object.temp_key);
      } catch (err) {
        console.warn('[MediaLibrary] Invalid temp_key format:', object.temp_key, err?.message);
      }
      await markDeletedAfterUnlink({
        tempKey: object.temp_key,
        physicalPaths: [tempPath].filter(Boolean),
      });
    } else {
      await markStorageObjectDeleted(object.id);
    }

    // Tệp chat: xoá luôn dòng danh mục `chat_attachments` (không để dòng mồ côi trỏ tới tệp đã mất).
    let catalogNames = [];
    if (object.category === 'chat' || object.reference_type === 'chat_attachment') {
      catalogNames = await mediaLibraryRepo.deleteChatCatalogRows({ storageObjectId: object.id, storageKey: object.storage_key })
        .catch((catalogErr) => {
          console.warn('[MediaLibrary] Không xoá được dòng danh mục chat_attachments:', catalogErr?.message);
          return [];
        });
    }

    // Nhật ký ghi TÊN và CỠ tệp (trước đây chỉ ghi nhóm + loại tham chiếu — chủ không biết tệp nào đã bị xoá).
    const sizeBytes = Number(object.size_bytes || 0);
    await logWorkspace(
      getWorkspaceAuditContext(req),
      AUDIT_ACTIONS.MEDIA_DELETED,
      AUDIT_ENTITY_TYPES.MEDIA_OBJECT,
      object.id,
      {
        category: object.category,
        referenceType: object.reference_type || null,
        displayName: catalogNames[0] || friendlyFileName(object.storage_key || object.temp_key) || null,
        sizeBytes,
      }
    );

    return res.json({ success: true, message: 'Đã xóa tệp thành công', data: { sizeBytes } });
  } catch (err) {
    console.error('[MediaLibrary] deleteStorageObject error:', err);
    return res.status(500).json({ success: false, code: MEDIA_ERROR_CODES.DELETE_FAILED, message: 'Không thể xóa tệp' });
  }
}
