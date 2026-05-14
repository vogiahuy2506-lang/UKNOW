import { Pool } from 'pg';

const pool = new Pool({
  host: 'ep-purple-recipe-aozj2siy-pooler.c-2.ap-southeast-1.aws.neon.tech',
  port: 5432,
  database: 'neondb',
  user: 'neondb_owner',
  password: 'npg_NIwRYl4VLj8W',
  ssl: { rejectUnauthorized: false }
});

async function checkUsers() {
  console.log('Checking users and subscriptions...\n');
  
  try {
    // Check plans
    const plans = await pool.query('SELECT * FROM plans ORDER BY id LIMIT 10');
    console.log('=== PLANS ===');
    if (plans.rows.length === 0) {
      console.log('No plans found');
    } else {
      plans.rows.forEach(p => console.log(`ID: ${p.id} | ${p.name} | $${p.price}`));
    }
    
    console.log('\n=== USERS WITH SUBSCRIPTIONS ===');
    const users = await pool.query(`
      SELECT u.id, u.username, u.email, u.full_name, u.role, 
             p.name as plan_name, p.price, sub.status, sub.expires_at
      FROM users u
      LEFT JOIN user_subscriptions sub ON u.id = sub.user_id AND sub.status = 'active'
      LEFT JOIN plans p ON sub.plan_id = p.id
      ORDER BY u.id DESC
      LIMIT 10
    `);
    
    if (users.rows.length === 0) {
      console.log('No users found');
    } else {
      users.rows.forEach(u => {
        console.log(`\nUser ID: ${u.id}`);
        console.log(`  Username: ${u.username}`);
        console.log(`  Email: ${u.email}`);
        console.log(`  Name: ${u.full_name}`);
        console.log(`  Role: ${u.role}`);
        console.log(`  Plan: ${u.plan_name || 'No subscription'}`);
        console.log(`  Status: ${u.status || 'N/A'}`);
        console.log(`  Expires: ${u.expires_at || 'N/A'}`);
      });
    }
    
  } catch (err) {
    console.error('Database error:', err.message);
    console.error(err);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

checkUsers();
