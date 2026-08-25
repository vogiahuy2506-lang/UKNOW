/**
 * Utility to normalize strings for search/filtering by stripping diacritics and lowercasing.
 */
export const foldDiacritics = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/gi, (m) => (m === 'Đ' ? 'D' : 'd'))
  .toLowerCase();
