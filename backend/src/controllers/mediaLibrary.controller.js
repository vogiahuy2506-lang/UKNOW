import path from 'path';
import * as mediaLibraryRepo from '../repositories/mediaLibrary.repository.js';
import uploadController from './upload.controller.js';
import { findStorageObjectById, markStorageObjectDeleted } from '../repositories/storage.repository.js';
import { markDeletedAfterUnlink } from '../services/storage/storageObject.service.js';
import { isReferenceAlive } from '../services/storage/storageReference.service.js';
import { resolveBillingUserId } from '../utils/billingCycle.util.js';

async function resolveOwnerId(req) {
  const ownerContextId = req.user?.activeContext?.type === 'employee'
    ? req.user.activeContext.ownerId
    : (req.headers['x-owner-context'] || null);
  const billingId = await resolveBillingUserId(req.user.id, { ownerContextId });
  return billingId || req.user.id;
}

export async function listMediaLibrary(req, res) {
  try {
    const ownerUserId = await resolveOwnerId(req);
    const result = await mediaLibraryRepo.listOwnedAttachments(ownerUserId, req.query);
    return res.json({ success: true, data: result.items, pagination: result.pagination });
  } catch (err) {
    console.error('[MediaLibrary] list error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Lỗi tải thư viện' });
  }
}

export async function listChannelMedia(req, res) {
  try {
    const ownerUserId = await resolveOwnerId(req);
    const result = await mediaLibraryRepo.listChannelAttachments(ownerUserId, req.query);
    return res.json({ success: true, data: result.items, pagination: result.pagination });
  } catch (err) {
    console.error('[MediaLibrary] channels error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Lỗi tải media kênh' });
  }
}

export async function listStorageObjects(req, res) {
  try {
    const ownerUserId = await resolveOwnerId(req);
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
    const ownerUserId = await resolveOwnerId(req);
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

    // Check if temp file is already expired
    const isExpiredTemp = object.category === 'temp' && object.expires_at && new Date(object.expires_at) < new Date();

    if (!isExpiredTemp && object.reference_type && object.reference_id) {
      const refStatus = await isReferenceAlive(object.reference_type, object.reference_id);
      if (refStatus?.alive) {
        const entityName = refStatus.name ? `"${refStatus.name}"` : refStatus.label;
        return res.status(409).json({
          success: false,
          code: 'STORAGE_REFERENCE_ALIVE',
          message: `Không thể xóa vì tệp đang được sử dụng bởi ${refStatus.label} ${entityName}`,
          data: {
            referenceType: object.reference_type,
            referenceId: object.reference_id,
            referenceName: refStatus.name,
            url: refStatus.url,
          },
        });
      }
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

    return res.json({ success: true, message: 'Đã xóa tệp thành công' });
  } catch (err) {
    console.error('[MediaLibrary] deleteStorageObject error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Không thể xóa tệp' });
  }
}

