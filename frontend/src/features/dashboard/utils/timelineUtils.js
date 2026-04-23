/**
 * Aggregate daily timeline data into monthly buckets.
 * Sums all numeric keys for each calendar month.
 *
 * Automatically discovers all numeric fields from the first item,
 * so it stays compatible when new metrics are added to the timeline.
 *
 * @param {Array<{date: string, [key: string]: number}>} timeline - Daily data (date: YYYY-MM-DD)
 * @returns {Array<{date: string, [key: string]: number}>} Monthly data (date: YYYY-MM), sorted ascending
 */
export const aggregateToMonthly = (timeline) => {
  if (!timeline?.length) return [];

  const numericKeys = Object.keys(timeline[0]).filter((k) => k !== 'date');
  const monthMap = {};

  timeline.forEach((item) => {
    const month = item.date.slice(0, 7); // "2026-03"
    if (!monthMap[month]) {
      monthMap[month] = { date: month };
      numericKeys.forEach((k) => { monthMap[month][k] = 0; });
    }
    numericKeys.forEach((k) => {
      monthMap[month][k] = (monthMap[month][k] || 0) + (item[k] || 0);
    });
  });

  return Object.values(monthMap).sort((a, b) => a.date.localeCompare(b.date));
};

/**
 * Format a YYYY-MM key for X-axis labels.
 * Returns "M-YYYY" (e.g., "3-2026").
 *
 * @param {string} value - "YYYY-MM"
 * @returns {string}
 */
export const formatMonthAxis = (value) => {
  const [year, month] = value.split('-');
  return `${parseInt(month, 10)}-${year}`;
};

/**
 * Format a YYYY-MM key for tooltip headers.
 * Returns "Tháng M/YYYY" (e.g., "Tháng 3/2026").
 *
 * @param {string} value - "YYYY-MM"
 * @returns {string}
 */
export const formatMonthTooltip = (value) => {
  const [year, month] = value.split('-');
  return `Tháng ${parseInt(month, 10)}/${year}`;
};
