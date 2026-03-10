import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'uknow_campaign',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  // Kích thước pool cấu hình qua env; mặc định 20 kết nối.
  max: Number.parseInt(process.env.DB_POOL_MAX, 10) || 20,
  idleTimeoutMillis: 30000,
  // Tăng timeout chờ kết nối từ 2s → 10s để chịu được tải cao khi nhiều campaign chạy đồng thời.
  connectionTimeoutMillis: 10000,
  // Timeout query tối đa 30s để phát hiện query bị kẹt sớm.
  statement_timeout: 30000,
});

pool.on('connect', async (client) => {
  try {
    await client.query("SET TIME ZONE 'Asia/Ho_Chi_Minh'");
  } catch (error) {
    console.error('Failed to set DB timezone:', error.message);
  }
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export default {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  pool
};
