require('dotenv/config');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'neondb',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    await pool.query('DELETE FROM marketplace_reviews');
    console.log('✓ Deleted marketplace_reviews');
    
    await pool.query('DELETE FROM marketplace_favorites');
    console.log('✓ Deleted marketplace_favorites');
    
    await pool.query('DELETE FROM marketplace_purchases');
    console.log('✓ Deleted marketplace_purchases');
    
    await pool.query('DELETE FROM marketplace_listings');
    console.log('✓ Deleted marketplace_listings');
    
    console.log('\n✅ Da xoa het data marketplace!');
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
  } finally {
    await pool.end();
  }
})();
