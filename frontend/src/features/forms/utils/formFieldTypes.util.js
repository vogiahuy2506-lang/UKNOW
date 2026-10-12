/**
 * Phân loại trường biểu mẫu + chia trang — bản FRONTEND của backend/src/utils/formFieldTypes.util.js
 * (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-4). Lệch với backend thì backend đúng.
 *
 * Mảng `fields` có hai nhóm: trường NHẬP (khách điền, có giá trị) và khối HIỂN THỊ (heading, paragraph,
 * page_break — chỉ dàn trang, không có giá trị / bắt buộc / vai trò / lựa chọn).
 */

export const DISPLAY_FIELD_TYPES = ['heading', 'paragraph', 'page_break'];

/** Số sao của loại `rating` (cố định 5, khớp backend RATING_MAX). */
export const RATING_MAX = 5;

/** @returns {boolean} true nếu là khối hiển thị (heading / paragraph / page_break) */
export function isDisplayFieldType(type) {
  return DISPLAY_FIELD_TYPES.includes(type);
}

/**
 * Chia danh sách trường thành các TRANG theo khối `page_break`.
 *
 * Trang rỗng KHÔNG được tạo (page_break đứng đầu / đứng cuối / nằm liền nhau): trang chỉ có tiêu đề/đoạn chữ vẫn
 * tính là có nội dung, trang không có khối nào thì bị bỏ. Tiêu đề của trang = nhãn của page_break MỞ ĐẦU trang đó
 * (page_break liền nhau thì lấy nhãn có chữ gần nhất); trang đầu tiên không có page_break phía trước nên không có
 * tiêu đề. Không có page_break nào → đúng 1 trang chứa mọi trường (hành vi cũ).
 *
 * Chọn xử lý ở renderer (không chuẩn hoá ở backend) vì renderer phải chịu được mọi dữ liệu server đã lưu, và xem
 * trước trong trình soạn dùng chính renderer nên thấy đúng cái khách sẽ thấy.
 *
 * @param {Array<{ type?: string, label?: string }>|null|undefined} fields
 * @returns {Array<{ title: string, fields: Array<object> }>} mảng rỗng khi không có trường nào để hiện
 */
export function splitFormPages(fields) {
  const list = Array.isArray(fields) ? fields : [];
  const pages = [];
  let current = { title: '', fields: [] };

  for (const field of list) {
    if (field?.type === 'page_break') {
      const title = typeof field.label === 'string' ? field.label.trim() : '';
      if (current.fields.length > 0) {
        pages.push(current);
        current = { title, fields: [] };
      } else {
        // Trang hiện tại còn trống (page_break đứng đầu hoặc liền nhau): không đẩy trang rỗng, chỉ cập nhật tiêu đề.
        current = { title: title || current.title, fields: [] };
      }
      continue;
    }
    current.fields.push(field);
  }
  if (current.fields.length > 0) pages.push(current);
  return pages;
}
