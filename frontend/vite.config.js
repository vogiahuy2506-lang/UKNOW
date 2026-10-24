import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({

  plugins: [react()],
  // react-icons@4.x export theo kiểu barrel rất nặng, và việc pre-bundle chỉ 1 entry (`react-icons`)
  // từng làm Vite minify nhầm các icon khác nhau thành cùng một component (tất cả sidebar/admin
  // icons cùng về một biểu tượng chung) trên production build. Ép từng subpath vào optimizeDeps
  // để dev + build production đều bundle đúng từng icon.
  optimizeDeps: {
    include: [
      'react-icons/hi',
      'react-icons/hi2',
      'react-icons/md',
      'react-icons/fa',
      'react-icons/fi',
      'react-icons/lu',
      'react-icons/ri',
      'react-icons/si',
      'react-icons/tb',
      'react-icons/wi',
    ],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-icons': [
            'react-icons/hi',
            'react-icons/hi2',
            'react-icons/md',
            'react-icons/fa',
            'react-icons/fi',
            'react-icons/lu',
            'react-icons/ri',
            'react-icons/si',
            'react-icons/tb',
            'react-icons/wi',
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    // Bể worker mặc định ('threads') chạy xong hết test rồi KHÔNG thoát: tiến
    // trình treo lại và quay CPU (V8 GC) vô hạn. Đã gặp thật — hai tiến trình
    // vitest bỏ quên chạy 9,5 giờ ở ~150% CPU mỗi cái, dù 141 test xong trong 3s.
    // 'forks' dùng tiến trình con, thoát sạch. Vitest 1.6.1 + Node 20.19.
    pool: 'forks',
    poolOptions: {
      forks: {
        // Trần heap mỗi tiến trình con. Đo 24/10/2026 cả bộ 595 file: file nặng nhất dùng 188 MB heap, mỗi tiến trình
        // ~250 MB RSS, cả lượt ~1,5 GB. Thế mà đã thấy tiến trình con phình tới 7,7 GB / 4,5 GB (máy 16 GB, swap 17 GB,
        // đứng máy): kill tiến trình vitest chính thì con thành mồ côi; con nào kẹt vòng lặp đồng bộ thì testTimeout không
        // cắt được và nó phình mãi. Có trần: con đó chết "heap out of memory", file đó báo đỏ, máy không bị nuốt RAM.
        // Con mồ côi còn sót do scripts/test-lock.mjs dọn khi lượt test sau giành khoá.
        execArgv: ['--max-old-space-size=1024'],
      },
    },
    exclude: [
      ...configDefaults.exclude,
    ],
  },
  server: mode === 'test' || process.env.VITEST ? { port: 0 } : {
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
}))
