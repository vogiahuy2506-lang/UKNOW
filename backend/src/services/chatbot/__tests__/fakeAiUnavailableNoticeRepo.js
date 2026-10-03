/**
 * Kho mốc GIẢ trong bộ nhớ cho spec — phản chiếu ĐÚNG ngữ nghĩa SQL của aiUnavailableNotice.repository.js:
 *  - claim: chiếm được khi chưa có dòng HOẶC `last_sent_at <= now - cooldown` (nguyên tử trong một tiến trình);
 *  - rewind: chỉ lùi đúng dòng mình vừa chiếm (`last_sent_at = claimedAt`).
 * Không phải spec (không đuôi .spec.js) nên Jest không chạy nó. Mock ở RANH GIỚI repository để logic thật của service
 * (chọn lý do, cooldown, email) chạy nguyên; SQL thật được kiểm ở tests/integration/aiUnavailableNotice.test.js.
 */
import { jest } from '@jest/globals';

export const NOTICE_KIND_OWNER_EMAIL = 'owner_email';
export const NOTICE_KIND_VISITOR_APOLOGY = 'visitor_apology';

export function createFakeNoticeRepo({ owner = { email: 'chu@example.com', full_name: 'Chủ Shop' } } = {}) {
  const rows = new Map();
  const keyOf = ({ idUser, kind, noticeKey = '' }) => `${idUser}|${kind}|${noticeKey}`;
  const repo = {
    rows,
    ownerContact: owner,
    claim: jest.fn(async (p) => {
      const k = keyOf(p);
      const row = rows.get(k);
      if (row && row.last_sent_at.getTime() > p.now.getTime() - p.cooldownMs) return false;
      rows.set(k, { last_sent_at: p.now, send_count: (row?.send_count || 0) + 1 });
      return true;
    }),
    rewind: jest.fn(async (p) => {
      const k = keyOf(p);
      const row = rows.get(k);
      if (row && row.last_sent_at.getTime() === p.claimedAt.getTime()) row.last_sent_at = p.retryAt;
    }),
    find: jest.fn(async (p) => rows.get(keyOf(p)) || null),
    purgeStaleVisitorApologies: jest.fn(async () => {}),
    findOwnerContact: jest.fn(async () => repo.ownerContact),
  };
  return repo;
}
