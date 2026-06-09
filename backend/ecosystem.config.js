/**
 * PM2 Ecosystem Config
 * 
 * Dùng PM2 để quản lý process với các lợi ích:
 * 1. Hot reload không kill process → giữ nguyên session Zalo trong memory
 * 2. Tự động restart khi crash
 * 3. Cluster mode cho load balancing (tùy chọn)
 * 
 * Cách dùng:
 *   npm install -g pm2
 *   pm2 start ecosystem.config.js
 *   pm2 logs                  # Xem logs
 *   pm2 restart all           # Restart tất cả
 *   pm2 reload all           # Hot reload (GIỮ SESSION!)
 *   pm2 stop all             # Dừng
 */
module.exports = {
  apps: [
    {
      name: 'uknow-backend',
      script: 'src/index.js',
      cwd: './',
      node_args: '--experimental-specifier-resolution=node',
      watch: false,              // Tắt watch để tránh restart liên tục khi code change
      ignore_watch: [            // Ignore các thư mục không cần restart
        'node_modules',
        'logs',
        '.git',
        '*.log'
      ],
      env: {
        NODE_ENV: 'development'
      },
      // Restart策略
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '1G',
      
      // Log config
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      
      // Process handling
      kill_timeout: 5000,
      listen_timeout: 3000,
      
      // Features
      instances: 1,              // Chỉ 1 instance để tránh conflict session
      instance_var: 'INSTANCE_ID',
      
      // Graceful shutdown - quan trọng để giữ session khi restart
      kill_retry_time: 3,
    }
  ]
};
