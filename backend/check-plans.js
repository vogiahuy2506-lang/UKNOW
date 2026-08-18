import db from './src/config/database.js';

async function checkSchema() {
  try {
    // Get plans table columns
    const plansCols = await db.query(
      `SELECT column_name, data_type 
       FROM information_schema.columns 
       WHERE table_name = 'plans' 
       ORDER BY ordinal_position`
    );
    console.log('=== PLANS TABLE COLUMNS ===');
    console.log(JSON.stringify(plansCols.rows, null, 2));
    
    // Get sample data
    const plans = await db.query('SELECT * FROM plans LIMIT 5');
    console.log('\n=== SAMPLE PLANS DATA ===');
    console.log(JSON.stringify(plans.rows, null, 2));
    
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

checkSchema();
