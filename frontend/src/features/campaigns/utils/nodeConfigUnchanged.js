import { createNodeConfigFormData } from './nodeConfigModal.helpers';

/**
 * Hộp cấu hình khối luôn ghi LẠI CẢ BỘ trường mặc định (sheetUrl, headerRow, columns…) khi bấm Lưu, kể cả khi người dùng
 * không đổi gì. Config đã lưu trong DB thì gọn hơn (chỉ trường có nghĩa) → so khớp chuỗi cho ra "Chưa lưu" oan:
 * mở chiến dịch → Sửa một khối → Lưu mà không đổi gì là trang báo "Chưa lưu".
 *
 * Cách làm an toàn: dựng lại ĐÚNG form mà hộp hiển thị lúc vừa mở (cùng hàm `createNodeConfigFormData` từ config đang có) rồi so
 * với form người dùng bấm Lưu. Bằng nhau (so theo khoá đã sắp xếp) → người dùng không đổi gì → bỏ qua, giữ config cũ.
 * Khác dù chỉ một trường (kể cả trường do hiệu ứng bất đồng bộ của hộp thêm vào) → coi là có đổi, lưu như cũ. Nghĩa là hàm này
 * chỉ có thể sai theo hướng "vẫn báo Chưa lưu", không bao giờ nuốt mất một thay đổi thật.
 */
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = stable(value[key]);
      return acc;
    }, {});
  }
  return value;
};

/**
 * @param {object} node khối React Flow đang cấu hình (`data.config`, `data.label`, `data.nodeType`)
 * @param {object} formData form hộp cấu hình tại lúc bấm Lưu
 * @param {string} [campaignType]
 * @returns {boolean} true nếu form không khác gì lúc hộp vừa mở
 */
export const isNodeConfigFormUnchanged = (node, formData, campaignType = '') => {
  if (!node || !formData || typeof formData !== 'object') return false;
  try {
    const pristine = createNodeConfigFormData({
      config: node.data?.config || {},
      label: node.data?.label || '',
      normalizeEmailSteps: true,
      nodeType: node.data?.nodeType,
      campaignType,
    });
    return JSON.stringify(stable(pristine)) === JSON.stringify(stable(formData));
  } catch {
    return false;
  }
};
