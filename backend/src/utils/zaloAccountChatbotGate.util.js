/**
 * Account-level chatbot enable gate for Zalo Personal (PLAN V-1).
 * Missing row / undefined / false → disabled. No fallback to channel settings.
 */
export function isZaloAccountChatbotEnabled(accountSettings) {
  return accountSettings?.is_enabled === true;
}
