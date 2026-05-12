import jwt from 'jsonwebtoken';
import db from '../config/database.js';

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

    let userResult;
    try {
      userResult = await db.query(
        `SELECT id, username, email, full_name, avatar_url, status, role, active_plan_id,
                subscription_expires_at
         FROM users
         WHERE id = $1 AND status IN ('active', 'pending_activation')`,
        [decoded.userId]
      );
    } catch {
      userResult = await db.query(
        `SELECT id, username, email, full_name, avatar_url, status, role, active_plan_id,
                NULL AS subscription_expires_at
         FROM users
         WHERE id = $1 AND status IN ('active', 'pending_activation')`,
        [decoded.userId]
      );
    }

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Người dùng không tồn tại hoặc đã bị vô hiệu hóa',
      });
    }

    const user = userResult.rows[0];
    req.user = { ...user };

    // Xử lý context switching: header X-Owner-Context cho phép user hoạt động
    // trong ngữ cảnh của một owner mà họ là employee.
    const ownerCtxId = req.headers['x-owner-context'];

    if (ownerCtxId) {
      const memberResult = await db.query(
        `SELECT um.permissions, u.active_plan_id AS "ownerPlanId",
                u.subscription_expires_at AS "ownerPlanExpiry"
         FROM user_members um
         JOIN users u ON u.id = um.owner_id
         WHERE um.employee_id = $1 AND um.owner_id = $2 AND um.status = 'active'`,
        [user.id, ownerCtxId]
      );

      if (!memberResult.rows[0]) {
        return res.status(403).json({
          success: false,
          message: 'Không có quyền truy cập với ngữ cảnh này',
          code: 'INVALID_CONTEXT',
        });
      }

      const member = memberResult.rows[0];
      req.user.activeContext = {
        type: 'employee',
        ownerId: Number(ownerCtxId),
        permissions: member.permissions,
        contextPlanId: member.ownerPlanId,
        contextPlanExpiry: member.ownerPlanExpiry,
      };
    } else {
      req.user.activeContext = {
        type: 'self',
        contextPlanId: user.active_plan_id,
        contextPlanExpiry: user.subscription_expires_at,
      };
    }

    return next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({ success: false, message: 'Token không hợp lệ' });
  }
};

export default authMiddleware;
