// Ngày (YYYY-MM-DD) theo giờ VN từ giá trị backend trả.
// TIMESTAMPTZ ra JSON dạng ISO UTC (00:00 +07 = 17:00Z hôm trước), slice(0,10) sẽ lùi 1 ngày.
export const toInputDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
};
