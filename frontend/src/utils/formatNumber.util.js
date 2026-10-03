/** Số nguyên → chuỗi có dấu chấm phân cách nghìn kiểu vi-VN (cùng cách các ô tiền trong trang Gói). */
export const formatIntVi = (value) => {
  if (value === '' || value === null || value === undefined) return '';
  const num = Number(value);
  return Number.isFinite(num) ? num.toLocaleString('vi-VN') : '';
};
