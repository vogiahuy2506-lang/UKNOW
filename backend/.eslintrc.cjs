/**
 * ESLint cho backend — CỐ Ý tối giản.
 *
 * Repo backend trước đây KHÔNG có lint, nên bật `eslint:recommended` sẽ ngập
 * hàng trăm cảnh báo `no-unused-vars`/`no-undef` và chặn CI. Thay vào đó chỉ bật
 * các rule "lỗi thật" gần như không báo nhầm. Trọng tâm là `no-dupe-class-members`:
 * đúng lớp bug đã gây 500 khi đọc file (2 method `_parseJson` trùng tên trong
 * `aiCampaign.service.js`, bản sau ghi đè bản trước một cách âm thầm).
 *
 * Muốn siết thêm về sau: nâng dần từng rule (vd `no-unused-vars: 'warn'`) rồi dọn.
 */
module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
    jest: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  ignorePatterns: ['node_modules/', 'coverage/', 'migrations/', 'tests/integration/sql/'],
  rules: {
    // Cấu trúc trùng lặp / ghi đè âm thầm — nguồn bug khó thấy
    'no-dupe-class-members': 'error',
    'no-dupe-keys': 'error',
    'no-dupe-args': 'error',
    'no-redeclare': 'error',
    // Code không bao giờ chạy tới (sau return/throw) — dấu hiệu logic hỏng
    'no-unreachable': 'error',
    // Gán vào thứ không được gán
    'no-const-assign': 'error',
    'no-func-assign': 'error',
    'no-import-assign': 'error',
    // Nhầm lẫn dễ gây bug thầm lặng
    'no-undef': 'error',
    'no-unsafe-negation': 'error',
    'no-cond-assign': ['error', 'except-parens'],
    'no-self-assign': 'error',
    'no-unsafe-finally': 'error',
    'getter-return': 'error',
    'no-obj-calls': 'error',
  },
};
