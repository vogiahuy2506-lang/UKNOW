import vi from './vi';

/**
 * Từ điển tiếng Anh (`en.js`, ~470 KB) nạp LƯỜI để khỏi nằm trong bundle chính: người dùng tiếng Việt (đa số)
 * không bao giờ phải tải nó. `vi` vẫn import tĩnh — là ngôn ngữ mặc định và là chỗ rơi về của `t()`.
 *
 * Module này giữ bản `en` sau khi nạp để chỗ ngoài React (api.js tra nhãn toast/lỗi) dùng được mà không
 * phải import tĩnh `en.js` (import tĩnh ở bất cứ đâu cũng kéo `en` ngược vào chunk chính).
 */

let loadedEnglish = null;
let loadingEnglish = null;

/** Từ điển `en` nếu đã nạp xong, chưa thì null. */
export const getLoadedEnglish = () => loadedEnglish;

/**
 * Nạp `en` (một lần; gọi lại dùng chung lượt đang bay / kết quả đã có). Nạp lỗi thì reject và lượt sau
 * được thử lại — chunk 404 sau deploy hay mất mạng thoáng qua không được khoá cứng cả phiên.
 * @returns {Promise<object>}
 */
export const loadEnglishDictionary = () => {
  if (loadedEnglish) return Promise.resolve(loadedEnglish);
  if (!loadingEnglish) {
    loadingEnglish = import('./en.js')
      .then((module) => {
        loadedEnglish = module.default;
        return loadedEnglish;
      })
      .finally(() => {
        loadingEnglish = null;
      });
  }
  return loadingEnglish;
};

/**
 * Từ điển để tra chuỗi NGOÀI React (không có hook): locale `en` mà `en` đã nạp → `en`; còn lại (vi, locale
 * lạ, hoặc `en` chưa nạp kịp) → `vi`. Không ném lỗi.
 * @param {string} locale
 * @returns {object}
 */
export const getLoadedDictionary = (locale) => (locale === 'en' && loadedEnglish ? loadedEnglish : vi);
