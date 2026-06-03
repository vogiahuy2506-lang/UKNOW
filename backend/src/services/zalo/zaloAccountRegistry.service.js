/**
 * Zalo Personal Account Registry
 *
 * Registry đơn giản để track các Zalo personal accounts đang active
 * và các accounts cần đăng ký listener mới.
 *
 * Dùng bởi:
 * - zaloSettings.controller.js: gọi addPendingAccount() khi login thành công
 * - zaloInbox.service.js: gọi getPendingAccounts() để đăng ký listeners
 */

/**
 * @type {Set<string>}
 */
const pendingAccounts = new Set();

/**
 * @type {Set<string>}
 */
const registeredAccounts = new Set();

/**
 * Thêm account vào danh sách pending để đăng ký listener
 * @param {string|number} accountId
 */
export function addPendingAccount(accountId) {
  const key = String(accountId);
  pendingAccounts.add(key);
  console.log(`[ZaloAccountRegistry] Account ${key} marked as pending for listener registration`);
}

/**
 * Lấy và xóa tất cả pending accounts
 * @returns {string[]}
 */
export function drainPendingAccounts() {
  const accounts = Array.from(pendingAccounts);
  pendingAccounts.clear();
  return accounts;
}

/**
 * Mark account as registered
 * @param {string|number} accountId
 */
export function markAccountRegistered(accountId) {
  const key = String(accountId);
  registeredAccounts.add(key);
}

/**
 * Check nếu account đã được registered
 * @param {string|number} accountId
 * @returns {boolean}
 */
export function isAccountRegistered(accountId) {
  return registeredAccounts.has(String(accountId));
}

/**
 * Remove account from registry
 * @param {string|number} accountId
 */
export function removeAccount(accountId) {
  const key = String(accountId);
  registeredAccounts.delete(key);
  pendingAccounts.delete(key);
}
