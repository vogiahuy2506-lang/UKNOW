import express from 'express';
import multer from 'multer';
import formPublicController from '../controllers/formPublic.controller.js';
import {
  publicFormSubmissionLimiter,
  formUnsubscribeLimiter,
  formReportPaidLimiter,
  formReceiptUploadLimiter,
} from '../middleware/rateLimiter.middleware.js';

const router = express.Router();
const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB (PR-5)
});

function handleReceiptMulter(req, res, next) {
  receiptUpload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'Ảnh vượt dung lượng tối đa 2 MB',
          code: 'FILE_TOO_LARGE',
        });
      }
      return res.status(400).json({
        success: false,
        message: err.message || 'Lỗi khi tải ảnh lên',
        code: 'FILE_UPLOAD_ERROR',
      });
    }
    next();
  });
}

// PR-7b — PHẢI khai TRƯỚC `/:publicKey` bên dưới: express khớp route theo thứ tự khai, nếu để
// sau thì "unsubscribe" sẽ bị nuốt làm giá trị của tham số `:publicKey`.
router.get('/unsubscribe/:token', formUnsubscribeLimiter, formPublicController.unsubscribe.bind(formPublicController));

router.get('/:publicKey', formPublicController.getPublic.bind(formPublicController));
router.get('/:publicKey/slots', formPublicController.getSlots.bind(formPublicController));
router.get('/:publicKey/submissions/:accessToken', formPublicController.getSubmissionStatus.bind(formPublicController));
router.post(
  '/:publicKey/submissions/:accessToken/report-paid',
  formReportPaidLimiter,
  formPublicController.reportPaymentSent.bind(formPublicController)
);
router.post(
  '/:publicKey/submissions/:accessToken/receipt',
  formReceiptUploadLimiter,
  handleReceiptMulter,
  formPublicController.uploadReceipt.bind(formPublicController)
);
router.post(
  '/:publicKey/submissions',
  publicFormSubmissionLimiter,
  formPublicController.submitPublic.bind(formPublicController)
);

export default router;
