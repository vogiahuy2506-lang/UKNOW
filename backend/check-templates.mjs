import db from './src/config/database.js';

try {
  const result = await db.query(
    "SELECT id, template_name, body_html, body_text FROM email_templates ORDER BY id DESC LIMIT 5"
  );
  for (const row of result.rows) {
    console.log('===', row.id, row.template_name, '===');
    console.log('--- body_html ---');
    console.log(row.body_html);
    console.log('--- body_text ---');
    console.log(row.body_text);
    console.log('');
  }
} catch (e) {
  console.error('Error:', e.message);
}
process.exit(0);
