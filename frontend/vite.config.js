import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    // Bể worker mặc định ('threads') chạy xong hết test rồi KHÔNG thoát: tiến
    // trình treo lại và quay CPU (V8 GC) vô hạn. Đã gặp thật — hai tiến trình
    // vitest bỏ quên chạy 9,5 giờ ở ~150% CPU mỗi cái, dù 141 test xong trong 3s.
    // 'forks' dùng tiến trình con, thoát sạch. Vitest 1.6.1 + Node 20.19.
    pool: 'forks',
    exclude: [
      ...configDefaults.exclude,
      // 🔴 NỢ CÓ Ý THỨC — 25/08/2026. Bỏ tạm, KHÔNG phải vì test sai.
      //
      // File này chạy MỘT MÌNH cũng treo: 2 test đều ✓ nhưng tiến trình không bao giờ thoát,
      // không in dòng tổng kết. Vì `Deploy Frontend` khai `needs: [lint, test]` và
      // `concurrency.cancel-in-progress: false`, một file treo làm mọi lượt deploy xếp hàng
      // chờ vô hạn — production tắc gần một ngày.
      //
      // Đã loại trừ, KHÔNG phải các nguyên nhân này:
      //   - pool: 'forks' đã bật sẵn ở trên (lần tái phát trước vá bằng cách này) — vẫn treo
      //   - thêm afterEach(cleanup) cho 6 lần render(<QuickSend />) — vẫn treo
      //   - QuickSend.jsx không có setInterval/setTimeout/EventSource nào
      //   - mock useNavigate trả hàm ổn định, useLocation trả state:null — không vòng lặp render
      // Nghi phạm còn lại: một promise trong fetchAccounts/fetchTemplates không bao giờ giải
      // quyết, hoặc một mock module giữ handle.
      //
      // Việc B trong _internal/PLAN_WIZARD_XUONG_NODE_VA_BOUNCE_2026-08-25.md: tìm handle rò,
      // bỏ dòng này, xác nhận `npx vitest run` thoát với mã 0.
      'src/pages/campaigns/__tests__/QuickSend.attachments.spec.jsx',
    ],
  },
  server: {
    port: 5174,
    host: true,
    allowedHosts: ["v1.haitrn.id.vn", "founderai.biz", "www.founderai.biz", "localhost"],
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      }
    }
  }
})
