import 'dotenv/config';
import db from '../src/config/database.js';

const { rows: plans } = await db.query(
  `SELECT id, name, is_active, is_custom FROM plans WHERE is_custom = TRUE OR id IN (11, 14, 15) ORDER BY id`
);
console.log('All custom plans + referenced plans:');
console.table(plans);

const { rows: users } = await db.query(
  `SELECT u.id, u.email, u.active_plan_id, p.name AS plan_name, p.is_active AS plan_is_active, p.is_custom AS plan_is_custom
     FROM users u
     LEFT JOIN plans p ON p.id = u.active_plan_id
    WHERE u.email IN ('test@example.com', 'minhthn22@uef.edu.vn')`
);
console.log('\nUsers state:');
console.table(users);

process.exit(0);
