/**
 * Tên tệp tải lên qua multer 1.x (busboy) được giải mã mặc định bằng latin1, nên tên có dấu tiếng Việt UTF-8 đến tay ta
 * dạng mojibake: "Profile chuyên gia.pdf" thành "Profile chuyÃªn gia.pdf" (A P3-1). Khôi phục bằng cách coi từng ký tự là một
 * byte rồi giải mã UTF-8 — như `controllers/upload.controller.js`.
 *
 * Khác bản ở controller: KHÔNG ép buộc. Giữ nguyên tên khi (a) đã có ký tự ngoài dải latin1 — tức là đã là Unicode thật
 * (client/phiên bản multer khác đã giải mã đúng), chuyển lần nữa sẽ cắt hỏng; hoặc (b) dãy byte không phải UTF-8 hợp lệ
 * (giải mã ra ký tự thay thế U+FFFD) — đó là tên latin1 thật như "café.pdf", không phải mojibake.
 *
 * @param {string} name `file.originalname`
 * @returns {string}
 */
export function decodeUploadFilename(name) {
  const raw = String(name ?? '');
  for (let i = 0; i < raw.length; i += 1) {
    if (raw.charCodeAt(i) > 0xff) return raw;
  }
  const decoded = Buffer.from(raw, 'latin1').toString('utf8');
  return decoded.includes(String.fromCharCode(0xfffd)) ? raw : decoded;
}
