import { validationResult } from 'express-validator';

const SENSITIVE_KEY_REGEX = /(password|token|secret|credential|cookie|key|code|otp|auth|pin)/i;

function sanitizeForLog(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForLog);
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      sanitized[key] = sanitizeForLog(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const rawErrors = errors.array();
    // Tuyệt đối không log field values để tránh lộ password, OTP, token
    const safeErrors = rawErrors.map((err) => ({
      path: err.path || err.param,
      msg: err.msg,
      location: err.location,
    }));
    console.log('[Validation Error]', JSON.stringify(safeErrors));
    console.log('[Validation Body]', JSON.stringify(sanitizeForLog(req.body)));
    return res.status(400).json({
      success: false,
      message: 'Dữ liệu không hợp lệ',
      errors: rawErrors,
    });
  }
  next();
};

export default handleValidationErrors;
