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

    const userResult = await db.query(
      `SELECT id, username, email, full_name, avatar_url, status, role, active_plan_id
       FROM users
       WHERE id = $1 AND status = 'active'`,
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Người dùng không tồn tại hoặc đã bị vô hiệu hóa',
      });
    }

    const user = userResult.rows[0];
    req.user = { ...user };

    // Chỉ query user_members khi là employee để lấy owner_id và permissions
    if (user.role === 'employee') {
      const memberResult = await db.query(
        `SELECT owner_id, permissions
         FROM user_members
         WHERE employee_id = $1 AND status = 'active'
         LIMIT 1`,
        [user.id]
      );

      if (memberResult.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Tài khoản nhân viên chưa được liên kết với chủ sở hữu',
        });
      }

      req.user.owner_id = memberResult.rows[0].owner_id;
      req.user.permissions = memberResult.rows[0].permissions;
    }

    return next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({ success: false, message: 'Token không hợp lệ' });
  }
};

export default authMiddleware;
