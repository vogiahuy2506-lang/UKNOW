/**
 * Tiêu chí "phiên Telegram còn dùng được" — hàm thuần, dùng chung cho preflight chiến dịch
 * (telegram.campaignChannel.checkReadiness) và danh sách tài khoản (telegramPersonal.listAccounts).
 * Phiên còn khoá đăng nhập khi blob có `authKeys.permanent` với ít nhất 1 khoá.
 * Không trả/không log nội dung khoá.
 *
 * @param {*} sessionBlob kết quả chatbotTelegramRepository.getSessionString
 * @returns {boolean}
 */
export function hasPermanentAuthKey(sessionBlob) {
  const permanentKeys = sessionBlob?.authKeys?.permanent;
  return Boolean(
    permanentKeys && typeof permanentKeys === 'object' && Object.keys(permanentKeys).length > 0
  );
}
