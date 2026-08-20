import crypto from 'crypto';
import landingPageVersionRepository from '../../repositories/landingPage/landingPageVersion.repository.js';
import { getStorageBackend } from '../storage/storageBackend.js';
import { registerWrittenStorageObject, markDeletedAfterUnlink } from '../storage/storageObject.service.js';
import { StorageQuotaExceededError } from '../storage/storageQuota.service.js';

const MAX_VERSIONS_PER_LANDING_PAGE = 5;

function computeHtmlHash(html) {
  return crypto.createHash('sha256').update(String(html || '').trim()).digest('hex');
}

class LandingPageVersionService {
  /**
   * Chụp lại phiên bản HTML cũ trước khi ghi đè, lưu file lên GCS và trừ quota người dùng.
   *
   * @param {object} params
   * @param {number} params.landingPageId
   * @param {number} params.workspaceOwnerId
   * @param {number|null} [params.actorUserId]
   * @param {string} params.oldHtml
   * @param {string} [params.title]
   * @param {string} [params.source] 'manual' | 'ai_generate' | 'ai_edit' | 'template' | 'rollback'
   * @returns {Promise<{ snapshotSaved: boolean, version?: object, warning?: string }>}
   */
  async createSnapshotIfChanged({
    landingPageId,
    workspaceOwnerId,
    actorUserId = null,
    oldHtml,
    title = null,
    source = 'manual',
  }) {
    const rawOldHtml = String(oldHtml || '').trim();
    if (!rawOldHtml) {
      return { snapshotSaved: false };
    }

    const htmlHash = computeHtmlHash(rawOldHtml);

    // So sánh với hash của phiên bản gần nhất để tránh duplicate khi bấm Save nhiều lần
    const latestVersion = await landingPageVersionRepository.findLatestByLandingPage(
      landingPageId,
      workspaceOwnerId
    );
    if (latestVersion && latestVersion.html_hash === htmlHash) {
      return { snapshotSaved: false };
    }

    const buffer = Buffer.from(rawOldHtml, 'utf8');
    const sizeBytes = buffer.length;
    const timestamp = Date.now();
    const randSuffix = crypto.randomBytes(4).toString('hex');
    const storageKey = `uploads/landing-versions/${workspaceOwnerId}/${landingPageId}/${timestamp}_${randSuffix}.html`;

    const storageBackend = getStorageBackend();

    try {
      // 1. Upload file lên GCS
      await storageBackend.put(storageKey, buffer, {
        contentType: 'text/html; charset=utf-8',
      });

      // 2. Tạo bản ghi version
      const createdVersion = await landingPageVersionRepository.createVersion({
        landingPageId,
        workspaceOwnerId,
        actorUserId,
        storageKey,
        title: title || 'Phiên bản cũ',
        htmlHash,
        sizeBytes,
        source,
      });

      // 3. Đăng ký storage object có quota check (registerWrittenStorageObject tự mở transaction riêng)
      try {
        await registerWrittenStorageObject({
          poolType: 'workspace',
          ownerUserId: workspaceOwnerId,
          actorUserId: actorUserId || workspaceOwnerId,
          storageKey,
          category: 'landing_version',
          state: 'active',
          sizeBytes,
          referenceType: 'landing_page_version',
          referenceId: createdVersion.id,
        });
      } catch (regErr) {
        // Rollback bản ghi version vừa tạo nếu đăng ký quota thất bại
        await landingPageVersionRepository.deleteByIdInWorkspace(
          createdVersion.id,
          workspaceOwnerId
        ).catch((rbErr) => {
          console.warn(`[LandingPageVersionService] Rollback version ${createdVersion.id} failed:`, rbErr.message);
        });
        throw regErr;
      }

      // 4. Giới hạn tối đa 5 bản gần nhất — prune các bản cũ vượt quá giới hạn
      await this.pruneOldVersions(
        landingPageId,
        workspaceOwnerId,
        MAX_VERSIONS_PER_LANDING_PAGE
      );

      return { snapshotSaved: true, version: createdVersion };
    } catch (err) {
      // Bẫy lớn nhất: Hết dung lượng (StorageQuotaExceededError) không được làm hỏng việc lưu trang chính
      if (err instanceof StorageQuotaExceededError || err?.code === 'STORAGE_QUOTA_EXCEEDED') {
        console.warn(`[LandingPageVersionService] Quota exceeded for workspace ${workspaceOwnerId}, skip snapshot version:`, err.message);
        // Xóa file rác vừa put lên GCS
        await storageBackend.delete(storageKey).catch((delErr) => {
          console.warn(`[LandingPageVersionService] Cleanup GCS key ${storageKey} failed:`, delErr.message);
        });
        return {
          snapshotSaved: false,
          warning: 'Đã lưu landing page nhưng không thể lưu lịch sử phiên bản do hết dung lượng gói lưu trữ.',
        };
      }

      // Với các lỗi khác: log warn, dọn dẹp GCS và cho qua để không chặn nghiệp vụ lưu trang
      console.error(`[LandingPageVersionService] Failed to create snapshot for landing page ${landingPageId}:`, err);
      await storageBackend.delete(storageKey).catch((delErr) => {
        console.warn(`[LandingPageVersionService] Cleanup GCS key ${storageKey} failed:`, delErr.message);
      });
      return { snapshotSaved: false };
    }
  }

  /**
   * Giữ tối đa N bản gần nhất của landing page, xóa các bản cũ khỏi GCS và DB
   */
  async pruneOldVersions(landingPageId, userId, keepCount = MAX_VERSIONS_PER_LANDING_PAGE) {
    try {
      const oldVersions = await landingPageVersionRepository.getOldVersionsBeyondLimit(
        landingPageId,
        userId,
        keepCount
      );

      if (!oldVersions || oldVersions.length === 0) return;

      for (const v of oldVersions) {
        try {
          // 1. Unlink khỏi storage_objects + xoá file trên GCS (markDeletedAfterUnlink tự xóa GCS)
          if (v.storage_key) {
            await markDeletedAfterUnlink({ storageKey: v.storage_key });
          }
          // 2. Chỉ xóa row trong DB khi bước dọn storage trên thành công
          await landingPageVersionRepository.deleteByIdInWorkspace(v.id, userId);
        } catch (delErr) {
          console.warn(`[LandingPageVersionService] Prune failed for version ${v.id} (key: ${v.storage_key}):`, delErr.message);
          // Giữ lại row để lần prune sau còn đầu mối dọn tiếp
        }
      }
    } catch (err) {
      console.error(`[LandingPageVersionService] pruneOldVersions failed for landing ${landingPageId}:`, err);
    }
  }

  /**
   * Lấy danh sách các phiên bản của landing page
   */
  async listVersions(landingPageId, userId) {
    const [versions, totalSizeBytes] = await Promise.all([
      landingPageVersionRepository.listByLandingPage(landingPageId, userId),
      landingPageVersionRepository.getTotalSizeBytes(landingPageId, userId),
    ]);

    return {
      versions: versions.map((v) => ({
        id: Number(v.id),
        landingPageId: Number(v.id_landing_page),
        title: v.title,
        sizeBytes: Number(v.size_bytes) || 0,
        source: v.source,
        createdAt: v.created_at,
      })),
      totalSizeBytes,
      maxVersions: MAX_VERSIONS_PER_LANDING_PAGE,
    };
  }

  /**
   * Lấy mã HTML của một phiên bản từ GCS
   */
  async getVersionHtml(versionId, landingPageId, userId) {
    const version = await landingPageVersionRepository.findById(versionId, landingPageId, userId);
    if (!version) {
      const err = new Error('Không tìm thấy phiên bản yêu cầu');
      err.statusCode = 404;
      throw err;
    }

    const storageBackend = getStorageBackend();
    const buffer = await storageBackend.getBuffer(version.storage_key);
    if (!buffer) {
      const err = new Error('Tệp nội dung của phiên bản không còn tồn tại trên kho lưu trữ');
      err.statusCode = 404;
      throw err;
    }

    return {
      version: {
        id: Number(version.id),
        title: version.title,
        sizeBytes: Number(version.size_bytes) || 0,
        source: version.source,
        createdAt: version.created_at,
      },
      htmlContent: buffer.toString('utf8'),
    };
  }

  /**
   * Xóa một phiên bản thủ công để giải phóng dung lượng
   */
  async deleteVersion(versionId, landingPageId, userId) {
    const version = await landingPageVersionRepository.findById(versionId, landingPageId, userId);
    if (!version) {
      const err = new Error('Không tìm thấy phiên bản yêu cầu');
      err.statusCode = 404;
      throw err;
    }

    if (version.storage_key) {
      await markDeletedAfterUnlink({ storageKey: version.storage_key }).catch(() => {});
    }

    await landingPageVersionRepository.deleteByIdInWorkspace(version.id, userId);
    return { success: true, deletedId: Number(version.id) };
  }
}

export default new LandingPageVersionService();
