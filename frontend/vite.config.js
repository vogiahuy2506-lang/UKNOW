import { defineConfig } from 'vite'
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
