import path from 'path';
import * as mediaLibraryRepo from '../repositories/mediaLibrary.repository.js';
import uploadController from './upload.controller.js';
import { findStorageObjectById, markStorageObjectDeleted } from '../repositories/storage.repository.js';
import { markDeletedAfterUnlink } from '../services/storage/storageObject.service.js';
import { resolveStorageObjectsUsage } from '../services/storage/storageReference.service.js';
import { getWorkspaceContext } from '../utils/workspaceContext.util.js';
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  logWorkspace,
} from '../services/audit.service.js';
import { getWorkspaceAuditContext } from '../utils/auditContext.util.js';

export async function listStorageObjects(req, res) {
  try {
    const ownerUserId = getWorkspaceContext(req.user).workspaceOwnerId;
    const result = await mediaLibraryRepo.listWorkspaceStorageObjects(ownerUserId, req.query);
    return res.json({
      success: true,
      data: result.items,
      categorySummary: result.categorySummary,
      pagination: result.pagination,
    });
  } catch (err) {
    console.error('[MediaLibrary] listStorageObjects error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Lỗi tải danh sách tệp' });
  }
}

export async function deleteStorageObject(req, res) {
  try {
    const ownerUserId = getWorkspaceContext(req.user).workspaceOwnerId;
    const objectId = Number(req.params.id);
    if (!Number.isSafeInteger(objectId) || objectId <= 0) {
      return res.status(400).json({ success: false, message: 'ID tệp không hợp lệ' });
    }

    const object = await findStorageObjectById(objectId);
    if (!object || Number(object.owner_user_id) !== Number(ownerUserId) || object.pool_type !== 'workspace') {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tệp' });
    }

    if (object.state === 'deleted') {
      return res.json({ success: true, message: 'Tệp đã được xóa' });
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
        code: 'STORAGE_REFERENCE_ALIVE',
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
    if (object.category === 'chat' || object.reference_type === 'chat_attachment') {
      await mediaLibraryRepo.deleteChatCatalogRows({ storageObjectId: object.id, storageKey: object.storage_key })
        .catch((catalogErr) => console.warn('[MediaLibrary] Không xoá được dòng danh mục chat_attachments:', catalogErr?.message));
    }

    await logWorkspace(getWorkspaceAuditContext(req), AUDIT_ACTIONS.MEDIA_DELETED, AUDIT_ENTITY_TYPES.MEDIA_OBJECT, object.id, { category: object.category, referenceType: object.reference_type || null });

    return res.json({ success: true, message: 'Đã xóa tệp thành công' });
  } catch (err) {
    console.error('[MediaLibrary] deleteStorageObject error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Không thể xóa tệp' });
  }
}
