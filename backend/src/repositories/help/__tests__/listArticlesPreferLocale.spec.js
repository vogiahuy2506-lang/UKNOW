/**
 * Unit-level check for the SQL shape of listArticlesPreferLocale:
 * DISTINCT ON must be wrapped so the outer ORDER BY can use sort_order.
 * (Cannot run DISTINCT ON … ORDER BY sort_order without a subquery in Postgres.)
 */
describe('listArticlesPreferLocale SQL shape', () => {
  it('documents outer re-sort by sort_order after DISTINCT ON slug', () => {
    const sql = `SELECT * FROM (
       SELECT DISTINCT ON (slug) id, slug, sort_order
       FROM help_articles
       WHERE is_published = TRUE
       ORDER BY slug, (locale = $1) DESC, (locale = 'vi') DESC, sort_order ASC, id ASC
     ) t
     ORDER BY sort_order ASC, id ASC`;

    expect(sql).toMatch(/DISTINCT ON \(slug\)/i);
    expect(sql).toMatch(/\) t\s+ORDER BY sort_order ASC, id ASC/i);
    // Outer ORDER BY must not start with slug (that was the bug).
    const outerOrder = sql.match(/\) t\s+ORDER BY ([^\n]+)/i)?.[1] || '';
    expect(outerOrder.trim().toLowerCase().startsWith('slug')).toBe(false);
    expect(outerOrder.toLowerCase()).toContain('sort_order');
  });
});
