import db from '../../config/database.js';
import customerMutationRepository from '../../repositories/customer/customerMutation.repository.js';
import customerTagRepository from '../../repositories/customer/customerTag.repository.js';
import customerTagService, { CUSTOMER_TAG_MAX_CUSTOMERS_PER_CALL } from '../customer/customerTag.service.js';
import {
  createCustomerContactIndex,
  collectContactLookupKeys,
  normalizeContactEmail,
  normalizeContactPhoneKey,
} from '../../utils/customerContactMatch.util.js';
import { isEmailHeader, isPhoneHeader } from '../../utils/columnHeaderMatch.util.js';

/** Số khoá email/SĐT mỗi lần tra DB — giữ câu `= ANY(...)` gọn khi danh sách nguồn lớn. */
const LOOKUP_KEYS_PER_QUERY = 2000;

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Lấy email / SĐT từ một dòng của khối nguồn (cùng tinh thần `extractEmailFromEntryRow` của runtime:
 * ưu tiên khoá chuẩn, sau đó dò theo tiêu đề cột để chịu được sheet đặt tên cột tiếng Việt).
 *
 * @param {Record<string, any>|null} row
 * @returns {{ email: string, phone: string }}
 */
export function extractContactFromItem(row) {
  if (!row || typeof row !== 'object') return { email: '', phone: '' };
  let email = '';
  let phone = '';
  for (const candidate of [row.email, row.Email, row.mail, row.contact_email]) {
    const value = String(candidate ?? '').trim();
    if (value.includes('@')) {
      email = value;
      break;
    }
  }
  for (const key of Object.keys(row)) {
    const value = row[key];
    if (value === null || value === undefined || typeof value === 'object') continue;
    const text = String(value).trim();
    if (!text) continue;
    if (!email && isEmailHeader(key) && text.includes('@')) email = text;
    else if (!phone && isPhoneHeader(key)) phone = text;
  }
  return { email, phone };
}

/** Khoá nhận diện một dòng nguồn theo email/SĐT (cùng chuẩn hoá với khớp khách). */
export function contactKey(contact) {
  return `${normalizeContactEmail(contact?.email) || ''}|${normalizeContactPhoneKey(contact?.phone) || ''}`;
}

/**
 * Khối "Gắn tag" của chiến dịch (PR-T2). Chỉ GẮN/GỠ tag cho khách ĐÃ CÓ trong workspace của chiến dịch —
 * không bao giờ tạo khách mới (muốn lưu khách thì đặt bước "Lưu khách hàng" phía trước).
 *
 * Bất biến:
 * - Mọi truy vấn khách đều lọc theo `workspaceOwnerId` (repository tra theo `COALESCE(workspace_owner_id, id_user)`,
 *   và `customerTag.assign/unassign` lọc thêm cả khách lẫn tag theo workspace).
 * - Idempotent: gắn lại cặp đã có là no-op, gỡ tag chưa gắn là no-op. Runtime chạy lại bước này ở mỗi lần
 *   resume / chu kỳ liên tục nên phải an toàn khi lặp.
 */
class CampaignTagStepService {
  /**
   * Tra khách của workspace theo email/SĐT cho một lô dòng nguồn (cùng quy tắc khớp với `save_customer`).
   *
   * @returns {Promise<{ customerIds: number[], matchedRows: number, matchedKeys: string[] }>}
   */
  async resolveCustomerIds(workspaceOwnerId, items) {
    const withContact = items.map(extractContactFromItem).filter((c) => c.email || c.phone);
    const keys = collectContactLookupKeys(withContact);
    const index = createCustomerContactIndex();
    const emailChunks = chunk(keys.emailKeys, LOOKUP_KEYS_PER_QUERY);
    const phoneChunks = chunk(keys.phoneKeys, LOOKUP_KEYS_PER_QUERY);
    const rounds = Math.max(emailChunks.length, phoneChunks.length);
    for (let i = 0; i < rounds; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const rows = await customerMutationRepository.preloadCustomersByContact(db, workspaceOwnerId, {
        emailKeys: emailChunks[i] || [],
        phoneKeys: phoneChunks[i] || [],
      });
      rows.forEach((row) => index.add(row));
    }
    const ids = new Set();
    const matchedKeys = [];
    for (const contact of withContact) {
      const found = index.find(contact);
      if (found?.id) {
        ids.add(Number(found.id));
        matchedKeys.push(contactKey(contact));
      }
    }
    return { customerIds: [...ids], matchedRows: matchedKeys.length, matchedKeys };
  }

  /**
   * @param {object} params
   * @param {number} params.workspaceOwnerId chủ workspace của chiến dịch
   * @param {Array<object>} params.items các dòng của khối nguồn
   * @param {'add'|'remove'|string} params.tagAction
   * @param {string} params.tagName
   * @param {number|null} [params.campaignId]
   * @param {number|null} [params.runId]
   * @param {Set<string>|null} [params.doneKeys] chỉ dùng ở chu kỳ liên tục: dòng đã xử lý xong ở chu kỳ trước (khoá
   *   `contactKey`) được bỏ qua để không tra lại cả danh sách tích luỹ mỗi chu kỳ; hàm tự ghi thêm các dòng vừa khớp.
   *   Dòng CHƯA khớp khách thì không ghi vào — chu kỳ sau thử lại (khách có thể vừa được bước Lưu khách hàng tạo).
   * @returns {Promise<{ action: string, tagName: string, tagId: number|null, totalItems: number, matched: number,
   *   notFound: number, changed: number }>} `totalItems` = số dòng THỰC SỰ xử lý lần này (đã trừ `doneKeys`)
   */
  async applyStep({ workspaceOwnerId, items, tagAction, tagName, campaignId = null, runId = null, doneKeys = null }) {
    const action = String(tagAction || 'add').trim().toLowerCase() === 'remove' ? 'remove' : 'add';
    const allRows = Array.isArray(items) ? items : [];
    const rows = doneKeys
      ? allRows.filter((row) => !doneKeys.has(contactKey(extractContactFromItem(row))))
      : allRows;
    const name = customerTagService.normalizeName(tagName);
    const base = { action, tagName: name, tagId: null, totalItems: rows.length, matched: 0, notFound: rows.length, changed: 0 };

    let tag;
    if (action === 'remove') {
      // Gỡ: tag chưa từng tồn tại thì không có gì để gỡ — KHÔNG tạo tag mới chỉ để gỡ.
      const found = await customerTagRepository.findByName(workspaceOwnerId, name);
      if (!found) return base;
      tag = { id: Number(found.id) };
      if (rows.length === 0) return { ...base, tagId: tag.id };
    } else {
      // Thêm: tag chưa có thì tạo (kể cả khi nguồn rỗng — người dùng đã chọn tag này cho chiến dịch).
      tag = await customerTagService.findOrCreateTagByName(workspaceOwnerId, name);
      if (rows.length === 0) return { ...base, tagId: tag.id };
    }

    const { customerIds, matchedRows, matchedKeys } = await this.resolveCustomerIds(workspaceOwnerId, rows);
    if (doneKeys) matchedKeys.forEach((key) => doneKeys.add(key));
    let changed = 0;
    for (const ids of chunk(customerIds, CUSTOMER_TAG_MAX_CUSTOMERS_PER_CALL)) {
      if (action === 'remove') {
        // eslint-disable-next-line no-await-in-loop
        const { removed } = await customerTagService.unassignTags(workspaceOwnerId, { customerIds: ids, tagIds: [tag.id] });
        changed += removed;
      } else {
        // eslint-disable-next-line no-await-in-loop
        const { assigned } = await customerTagService.assignTags(workspaceOwnerId, {
          customerIds: ids,
          tagIds: [tag.id],
          source: 'campaign',
          campaignId,
          runId,
        });
        changed += assigned;
      }
    }
    return { ...base, tagId: tag.id, matched: matchedRows, notFound: rows.length - matchedRows, changed };
  }
}

export default new CampaignTagStepService();
