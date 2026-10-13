/**
 * Đổi sang đúng không gian làm việc của một thông báo TRƯỚC khi mở link của nó.
 *
 * Chuông đọc theo NGƯỜI đăng nhập chứ không theo không gian đang xem, nên một chuông của chủ A có thể tới tay nhân viên đang ở
 * không gian cá nhân (nhân viên có gói riêng mặc định ở `self` — xem `pickDefaultContext`), hoặc tới chính chủ đang xem không gian
 * của người khác. Mở link `/app/...` ngoài đúng không gian = 404. Thông báo muốn được đổi không gian thì mang
 * `metadata.workspaceOwnerId` (id CHỦ không gian); chuông cũ / loại khác không có trường này giữ nguyên hành vi (không đổi gì).
 *
 * Helper này CHỈ đổi không gian, không điều hướng: `openNotificationLink` là util an toàn URL riêng, không đụng vào.
 * Mọi lỗi chỉ bị nuốt (`console.warn`) để việc điều hướng sau đó vẫn diễn ra.
 *
 * @param {{ metadata?: { workspaceOwnerId?: unknown } }|null|undefined} item thông báo (DTO của GET /api/notifications)
 * @param {{
 *   user?: { id?: number|string, memberships?: Array<{ ownerId?: number|string, isLocked?: boolean, acceptedAt?: unknown }> }|null,
 *   activeContext?: { type?: string, ownerId?: number|string }|null,
 *   switchContext?: (ownerId: number|string|null) => Promise<void>|void,
 * }} deps
 * @returns {Promise<void>}
 */
export async function ensureNotificationWorkspace(item, { user, activeContext, switchContext } = {}) {
  try {
    const raw = item?.metadata?.workspaceOwnerId;
    // Chuỗi số nguyên dương thuần (`'7'`) hoặc số; từ chối '', '0', '-1', '7abc', '1e3', '7.5' để không đổi không gian theo dữ liệu rác.
    const parsed = typeof raw === 'number' ? raw : (typeof raw === 'string' && /^[1-9]\d*$/.test(raw) ? Number(raw) : NaN);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) return;
    if (typeof switchContext !== 'function') return;
    const target = raw; // giữ nguyên giá trị gốc khi gọi switchContext (nó so bằng String(), chuỗi hay số đều khớp)

    // Chuông về không gian của chính mình: đang ở không gian công ty khác thì về lại cá nhân.
    if (String(target) === String(user?.id)) {
      if (activeContext?.type !== 'self') await switchContext(null);
      return;
    }

    // Đang đúng không gian của chủ đó rồi.
    if (activeContext?.type === 'employee' && String(activeContext.ownerId) === String(target)) return;

    const membership = (user?.memberships || []).find((m) => String(m?.ownerId) === String(target));
    // Khoá / chưa chấp nhận / không phải thành viên: backend sẽ 403 mọi request (kể cả /auth/me → đăng xuất), xem `pickDefaultContext`.
    if (!membership || membership.isLocked || membership.acceptedAt === null) return;

    await switchContext(target);
  } catch (error) {
    console.warn('[ensureNotificationWorkspace] Không đổi được không gian làm việc, vẫn mở link:', error);
  }
}
