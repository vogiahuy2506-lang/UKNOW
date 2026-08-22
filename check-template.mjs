import db from '../backend/src/config/database.js';

const result = await db.query(
  "SELECT id, template_name, body_html, body_text FROM email_templates ORDER BY id DESC LIMIT 3"
);
console.log(JSON.stringify(result.rows, null, 2));
process.exit(0);
