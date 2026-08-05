import jwt from 'jsonwebtoken';
import db from '../config/database.js';

/**
 * Load user + activeContext (self / employee) for a known userId.
 * Shared by authMiddleware and SSE (query-token) so plan checks stay in one place.
 *
 * @param {number|string} userId
 * @param {{ ownerContextId?: string|number|null }} [options]
 * @returns {Promise<object>} user object suitable for req.user
 * @throws {{ status: number, body: object }}
 */
export async function resolveUserContext(userId, { ownerContextId = null } = {}) {
  let userResult;
  try {
    userResult = await db.query(
      `SELECT id, username, email, password_hash, full_name, avatar_url, status, role, active_plan_id,
              subscription_expires_at, must_change_password
       FROM users
       WHERE id = $1 AND status IN ('active', 'pending_activation')`,
      [userId]
    );
  } catch {
    userResult = await db.query(
      `SELECT id, username, email, NULL AS password_hash, full_name, avatar_url, status, role, active_plan_id,
              NULL AS subscription_expires_at, FALSE AS must_change_password
       FROM users
       WHERE id = $1 AND status IN ('active', 'pending_activation')`,
      [userId]
    );
  }

  if (userResult.rows.length === 0) {
    const err = new Error('Người dùng không tồn tại hoặc đã bị vô hiệu hóa');
    err.status = 401;
    err.body = { success: false, message: err.message };
    throw err;
  }

  const user = { ...userResult.rows[0] };

  if (ownerContextId != null && ownerContextId !== '') {
    const memberResult = await db.query(
      `SELECT um.permissions, u.active_plan_id AS "ownerPlanId",
              u.subscription_expires_at AS "ownerPlanExpiry"
       FROM user_members um
       JOIN users u ON u.id = um.owner_id
       WHERE um.employee_id = $1 AND um.owner_id = $2 AND um.status = 'active'`,
      [user.id, ownerContextId]
    );

    if (!memberResult.rows[0]) {
      const err = new Error('Không có quyền truy cập với ngữ cảnh này');
      err.status = 403;
      err.body = {
        success: false,
        message: err.message,
        code: 'INVALID_CONTEXT',
      };
      throw err;
    }

    const member = memberResult.rows[0];
    user.activeContext = {
      type: 'employee',
      ownerId: Number(ownerContextId),
      permissions: member.permissions,
      contextPlanId: member.ownerPlanId,
      contextPlanExpiry: member.ownerPlanExpiry,
    };
  } else {
    user.activeContext = {
      type: 'self',
      contextPlanId: user.active_plan_id,
      contextPlanExpiry: user.subscription_expires_at,
    };
  }

  return user;
}

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Không tìm thấy token xác thực',
      });
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token đã hết hạn',
          code: 'TOKEN_EXPIRED',
        });
      }
      return res.status(401).json({ success: false, message: 'Token không hợp lệ' });
    }

    try {
      req.user = await resolveUserContext(decoded.userId, {
        ownerContextId: req.headers['x-owner-context'],
      });
    } catch (err) {
      if (err.status && err.body) {
        return res.status(err.status).json(err.body);
      }
      throw err;
    }

    return next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({ success: false, message: 'Token không hợp lệ' });
  }
};

/**
 * Optional auth: attach req.user when Bearer token is valid; otherwise continue anonymously.
 * Used for PayOS return URL polling where the bank in-app browser may lack the SPA token.
 */
export const optionalAuthMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }
  return authMiddleware(req, res, next);
};

/**
 * Soft-attach user id for rate limiting (Bearer only). Never returns 401.
 * Sets req.rateLimitUserId when verify succeeds.
 */
export function attachUserIdForRateLimit(req, _res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded?.userId != null) {
        req.rateLimitUserId = decoded.userId;
      }
    }
  } catch {
    // ignore — authMiddleware will reject later if needed
  }
  return next();
}

/**
 * Soft-attach user id from SSE query token for sseLimiter. Never returns 401.
 */
export function attachSseUserIdForRateLimit(req, _res, next) {
  try {
    const token = req.query?.token;
    if (token) {
      const decoded = jwt.verify(String(token), process.env.JWT_SECRET);
      if (decoded?.userId != null) {
        req.rateLimitUserId = decoded.userId;
      }
    }
  } catch {
    // ignore
  }
  return next();
}

export default authMiddleware;
