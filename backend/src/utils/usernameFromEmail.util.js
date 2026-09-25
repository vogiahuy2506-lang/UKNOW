/**
 * Sinh tên đăng nhập duy nhất từ email (dùng chung cho Google login và mời nhân viên qua email).
 *
 * Quy tắc (kế thừa từ auth.controller.js:496-506):
 * 1. Lấy phần trước dấu '@', loại bỏ mọi ký tự không phải chữ cái và số (chỉ giữ a-z, A-Z, 0-9).
 * 2. Nếu độ dài < 3 ký tự (hoặc rỗng do toàn ký tự đặc biệt), thêm 'user'.
 * 3. Đảm bảo duy nhất: gọi hàm `isUsernameTaken(candidate)` để kiểm tra, nếu trùng thì thêm hậu tố số tăng dần (1, 2, ...).
 *
 * @param {string} email Email nguồn
 * @param {(candidate: string) => Promise<boolean> | boolean} isUsernameTaken Hàm kiểm tra tên đã có người dùng chưa
 * @returns {Promise<string>} Tên đăng nhập hợp lệ và duy nhất
 */
export async function generateUsernameFromEmail(email, isUsernameTaken) {
  const rawPrefix = (typeof email === 'string' ? email.split('@')[0] : '') || '';
  let baseUsername = rawPrefix.replace(/[^a-zA-Z0-9]/g, '');

  if (baseUsername.length < 3) {
    baseUsername += 'user';
  }

  let username = baseUsername;
  let suffix = 1;

  while (await isUsernameTaken(username)) {
    username = `${baseUsername}${suffix}`;
    suffix++;
  }

  return username;
}
