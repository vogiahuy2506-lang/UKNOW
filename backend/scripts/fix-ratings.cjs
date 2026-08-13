const db = require('../src/config/database.js').default;

(async () => {
  try {
    const result = await db.query(`
      UPDATE marketplace_listings ml SET
        rating_avg = COALESCE(sub.avg, 0),
        rating_count = COALESCE(sub.count, 0)
      FROM (
        SELECT listing_id, AVG(rating)::DECIMAL(3,2) as avg, COUNT(*) as count
        FROM marketplace_reviews GROUP BY listing_id
      ) sub WHERE ml.id = sub.listing_id
    `);
    console.log('Ratings updated:', result.rowCount, 'listings');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
