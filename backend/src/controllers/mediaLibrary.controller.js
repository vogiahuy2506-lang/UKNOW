import * as mediaLibraryRepo from '../repositories/mediaLibrary.repository.js';
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
