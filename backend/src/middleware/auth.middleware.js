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
      const result = await db.query(
        'SELECT id, username, email, full_name, avatar_url, status FROM users WHERE id = $1 AND status = $2',
        [decoded.userId, 'active']
      );

      if (result.rows.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'Người dùng không tồn tại hoặc đã bị vô hiệu hóa'
        });
      }

      req.user = result.rows[0];
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
