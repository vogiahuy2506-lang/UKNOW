import 'dotenv/config';
import db from './src/config/database.js';

async function createTestUser() {
  console.log('Creating test user...\n');
  
  try {
    // Check if user_subscriptions table exists
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'user_subscriptions'
      ) as exists
    `);
    
    const hasSubscriptionsTable = tableCheck.rows[0]?.exists;
    console.log('Has user_subscriptions table:', hasSubscriptionsTable);
    
    // Create user_subscriptions table if not exists
    if (!hasSubscriptionsTable) {
      console.log('Creating user_subscriptions table...');
      await db.query(`
        CREATE TABLE IF NOT EXISTS user_subscriptions (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          plan_id INTEGER,
          status VARCHAR(50) DEFAULT 'active',
          started_at TIMESTAMP DEFAULT NOW(),
          expires_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('Table created!');
    }
    
    // Check if plans table exists
    const plansTableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'plans'
      ) as exists
    `);
    
    const hasPlansTable = plansTableCheck.rows[0]?.exists;
    console.log('Has plans table:', hasPlansTable);
    
    // Create plans table if not exists
    if (!hasPlansTable) {
      console.log('Creating plans table...');
      await db.query(`
        CREATE TABLE IF NOT EXISTS plans (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          code VARCHAR(100),
          description TEXT,
          price DECIMAL(10,2) DEFAULT 0,
          features JSONB,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('Plans table created!');
      
      // Insert default plan
      await db.query(`
        INSERT INTO plans (name, code, price, features) 
        VALUES ('Free', 'free', 0, '{"campaigns": 1, "emails": 100, "zalo": 50}')
        ON CONFLICT DO NOTHING
      `);
      await db.query(`
        INSERT INTO plans (name, code, price, features) 
        VALUES ('Starter', 'starter', 199000, '{"campaigns": 5, "emails": 1000, "zalo": 500}')
        ON CONFLICT DO NOTHING
      `);
      await db.query(`
        INSERT INTO plans (name, code, price, features) 
        VALUES ('Pro', 'pro', 499000, '{"campaigns": -1, "emails": -1, "zalo": -1}')
        ON CONFLICT DO NOTHING
      `);
      console.log('Default plans inserted!');
    }
    
    // Check if test user exists
    const existingUser = await db.query(
      `SELECT id, username, email FROM users WHERE email = $1 OR username = $2`,
      ['test@example.com', 'testuser']
    );
    
    let userId;
    
    if (existingUser.rows.length > 0) {
      console.log('Test user already exists:', existingUser.rows[0]);
      userId = existingUser.rows[0].id;
    } else {
      // Create new user
      console.log('Creating new test user...');
      const bcrypt = await import('bcryptjs');
      const passwordHash = await bcrypt.hash('Test123456', 10);
      
      const newUser = await db.query(
        `INSERT INTO users (username, email, password, full_name, role, is_active, created_at)
         VALUES ($1, $2, $3, $4, $5, true, NOW())
         RETURNING id, username, email`,
        ['testuser', 'test@example.com', passwordHash, 'Test User', 'employee']
      );
      
      userId = newUser.rows[0].id;
      console.log('User created:', newUser.rows[0]);
    }
    
    // Check subscription
    const sub = await db.query(
      `SELECT * FROM user_subscriptions WHERE user_id = $1 AND status = 'active'`,
      [userId]
    );
    
    if (sub.rows.length > 0) {
      console.log('User already has subscription:', sub.rows[0]);
    } else {
      // Get plan ID
      const plan = await db.query(`SELECT id FROM plans WHERE code = 'pro' LIMIT 1`);
      const planId = plan.rows.length > 0 ? plan.rows[0].id : 1;
      
      // Create subscription
      console.log('Creating subscription for user...');
      await db.query(
        `INSERT INTO user_subscriptions (user_id, plan_id, status, started_at, expires_at)
         VALUES ($1, $2, 'active', NOW(), NOW() + INTERVAL '1 year')`,
        [userId, planId]
      );
      console.log('Subscription created!');
    }
    
    console.log('\n=== TEST ACCOUNT CREDENTIALS ===');
    console.log('Email: test@example.com');
    console.log('Username: testuser');
    console.log('Password: Test123456');
    console.log('================================\n');
    console.log('Login at: http://localhost:5174/');
    
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err);
  } finally {
    await db.pool.end();
    process.exit(0);
  }
}

createTestUser();
