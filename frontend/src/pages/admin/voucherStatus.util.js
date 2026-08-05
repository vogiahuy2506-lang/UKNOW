/**
 * Derived admin status cho voucher — PLAN_VOUCHER V-2b.
 * Trích ra file riêng để AdminVouchersPage.jsx chỉ export component
 * (fast-refresh chỉ hoạt động tốt khi file chỉ export components).
 */

/**
 * @param {object} voucher - Voucher record (có isActive, endsAt).
 * @param {number} [now=Date.now()] - Timestamp hiện tại (để test).
 * @returns {'active'|'expired'|'disabled'}
 */
export const getVoucherLifecycleStatus = (voucher, now = Date.now()) => {
  if (voucher.isActive) return 'active';
  if (voucher.endsAt && new Date(voucher.endsAt).getTime() < now) return 'expired';
  return 'disabled';
};