/**
 * Vá danh sách đánh số bị cắt rời trong body_html của bài hướng dẫn.
 *
 * Bối cảnh: bộ chuyển Markdown→HTML cũ đóng <ol> mỗi khi gặp dòng trống, nên
 * chú thích ảnh thụt lề nằm giữa các bước bị đẩy ra thành <p> cấp cao nhất và
 * bước kế tiếp mở một <ol> MỚI — đếm lại từ 1. Bộ chuyển đã được sửa, nhưng
 * HTML sinh ra trước đó thì đã nằm sẵn trong DB.
 *
 * Vì sao không dựng lại từ body_md cho xong: khi admin sửa bài bằng trình soạn
 * thảo mới, hệ thống CHỈ lưu body_html — body_md giữ nguyên bản cũ còn chú thích
 * "[ẢNH: ...]". Dựng lại từ body_md sẽ xoá sạch ảnh thật admin đã chèn. Hàm này
 * chỉ di chuyển node trong chính HTML đang lưu nên ảnh được giữ nguyên.
 *
 * GIỚI HẠN đã biết: chú thích của bước CUỐI (đứng sau </ol>, không có <ol> theo
 * sau) sẽ nằm lại ngoài danh sách. Trong HTML nó không phân biệt được với một
 * đoạn văn độc lập thật sự — chỉ thụt lề trong Markdown mới nói lên điều đó.
 * Không ảnh hưởng số thứ tự, chỉ khác chút về canh lề.
 */

/** Một khối <p>…</p> không chứa thẻ mở/đóng của list, heading hay bảng. */
const CAPTION_BLOCK = '(?:<p>(?:(?!<\\/?(?:ol|ul|h[1-6]|table)\\b)[\\s\\S])*?<\\/p>)+';
const SPLIT_PATTERN = new RegExp(`</li></ol>(${CAPTION_BLOCK})<ol>`, 'g');

/**
 * Gộp các <ol> bị một/nhiều đoạn <p> chen giữa thành một <ol> duy nhất, đưa các
 * đoạn đó vào trong <li> ngay trước chúng.
 *
 * @param {string} html body_html đang lưu
 * @returns {string} HTML đã vá (trả nguyên chuỗi vào nếu không có gì để vá)
 */
export function repairSplitOrderedLists(html) {
  if (typeof html !== 'string' || !html) return html;

  // Đặt cờ tạm cho ranh giới đã gộp rồi xoá một lượt ở cuối: thay trực tiếp
  // thành '' sẽ khiến vòng lặp không nhận ra mình vừa đổi gì và dừng sớm khi
  // có từ 3 khối <ol> liên tiếp trở lên.
  const MERGED = '<!--__OL_MERGED__-->';
  let out = html;
  let previous;
  do {
    previous = out;
    out = out.replace(SPLIT_PATTERN, (_match, captions) => `${captions}</li>${MERGED}`);
  } while (out !== previous);

  return out.split(MERGED).join('');
}

/**
 * Đếm số thẻ <ol> — dùng để báo cáo trước/sau khi vá.
 * @param {string} html
 * @returns {number}
 */
export function countOrderedLists(html) {
  return (String(html || '').match(/<ol>/g) || []).length;
}

/**
 * Bỏ toàn bộ thẻ, gom khoảng trắng — dùng để chứng minh bản vá không đổi chữ.
 * @param {string} html
 * @returns {string}
 */
export function stripTags(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
