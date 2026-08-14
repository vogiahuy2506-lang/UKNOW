import { getStorageUsage, resolveWorkspaceOwnerId } from '../services/storage/storageQuota.service.js';

export async function getUsage(req, res) {
  try {
    const ownerUserId = resolveWorkspaceOwnerId(req.user);
    const usage = await getStorageUsage(ownerUserId);
    return res.json({ success: true, data: usage });
  } catch (error) {
    console.error('[Storage] usage lookup failed:', error.message);
    return res.status(500).json({ success: false, message: 'Không thể tải dung lượng lưu trữ' });
  }
}
