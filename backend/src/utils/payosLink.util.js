import payosClient from './payos.util.js';

/**
 * Best-effort cancel PayOS payment links (expired / already cancelled ignored).
 * @param {Array<number|string>} orderCodes
 */
export async function bestEffortCancelPayosLinks(orderCodes = []) {
  for (const code of orderCodes) {
    try {
      await payosClient.paymentRequests.cancel(Number(code));
    } catch (err) {
      console.warn(`[PayOS] cancel link ${code} ignored:`, err?.message);
    }
  }
}
