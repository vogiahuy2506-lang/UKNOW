import jwt from 'jsonwebtoken';
import db from '../config/database.js';

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Không tìm thấy token xác thực'
      });
    }

    const token = authHeader.split(' ')[1];
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Kiểm tra user trong database
      let result;
      try {
        result = await db.query(
          `SELECT u.id, u.username, u.email, u.full_name, u.avatar_url, u.status,
                  r.role_code, r.role_name
           FROM users u
           LEFT JOIN roles r ON u.id_role = r.id
           WHERE u.id = $1 AND u.status = $2`,
          [decoded.userId, 'active']
        );
      } catch (queryError) {
        // Tương thích ngược: nếu DB chưa chạy migration role thì fallback về schema cũ.
        result = await db.query(
          'SELECT id, username, email, full_name, avatar_url, status FROM users WHERE id = $1 AND status = $2',
          [decoded.userId, 'active']
        );
      }

      if (result.rows.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'Người dùng không tồn tại hoặc đã bị vô hiệu hóa'
        });
      }

      req.user = {
        ...result.rows[0],
        role_code: result.rows[0]?.role_code || 'employee',
        role_name: result.rows[0]?.role_name || 'Nhân viên',
      };
      next();
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token đã hết hạn',
          code: 'TOKEN_EXPIRED'
        });
      }
      throw jwtError;
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({
      success: false,
      message: 'Token không hợp lệ'
    });
  }
};

export default authMiddleware;
