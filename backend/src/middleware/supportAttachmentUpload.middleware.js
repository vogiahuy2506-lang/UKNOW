import multer from 'multer';
import { SUPPORT_ATTACHMENT_MAX_BYTES } from '../services/support/supportTicketAttachment.service.js';

/**
 * Nhận MỘT ảnh đính kèm ticket (field `file`, multipart) vào bộ nhớ, tối đa 5 MB. Lỗi của multer đổi sang JSON có `code` rõ ràng
 * thay vì để rơi vào bộ xử lý lỗi chung (500).
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: SUPPORT_ATTACHMENT_MAX_BYTES, files: 1 },
});

export function receiveSupportAttachment(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          code: 'SUPPORT_ATTACHMENT_TOO_LARGE',
          message: 'Mỗi ảnh tối đa 5 MB',
        });
      }
      return res.status(400).json({
        success: false,
        code: 'SUPPORT_ATTACHMENT_INVALID',
        message: 'Tệp đính kèm không hợp lệ (mỗi lần chỉ tải một ảnh, field "file")',
      });
    }
    return next(error);
  });
}

export default receiveSupportAttachment;
