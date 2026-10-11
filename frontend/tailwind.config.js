import plugin from 'tailwindcss/plugin.js';

/**
 * Bộ "animate-in" tối giản — thay cho plugin `tailwindcss-animate` mà repo KHÔNG cài (không `npm install` thêm).
 * 16 chỗ / 10 tệp viết `animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-150` (modal xác nhận, ô gợi ý ngân
 * hàng, menu thiết bị của landing canvas...) mà Tailwind 3 không có các class này → không sinh CSS → hộp thoại hiện
 * ngay, không hiệu ứng, không báo lỗi gì. Chỉ làm họ "vào" (không có `animate-out`): đủ cho các tên đang dùng, và chốt
 * `tailwindClassesExist.spec.js` đòi MỌI class `animate-in`/`fade-in`/`zoom-in`/`slide-in-from-*` trong src phải sinh CSS.
 * Cách hoạt động như `tailwindcss-animate`: `animate-in` chạy keyframes `enter`, các class còn lại đặt biến `--tw-enter-*`
 * mà keyframes đọc (thiếu biến → giữ nguyên giá trị thường: opacity 1, scale 1, không dịch).
 * `duration-*` của Tailwind chỉ đặt `transition-duration` nên cần thêm bản `animation-duration` — viết dạng ghép
 * `.animate-in[class~="duration-N"]` để KHÔNG đổi thời lượng của `animate-spin`/`animate-pulse` ở các chỗ khác.
 */
const animateInPlugin = plugin(({ addUtilities, matchUtilities, theme }) => {
  addUtilities({
    '@keyframes enter': {
      from: {
        opacity: 'var(--tw-enter-opacity, 1)',
        transform:
          'translate3d(var(--tw-enter-translate-x, 0), var(--tw-enter-translate-y, 0), 0) scale3d(var(--tw-enter-scale, 1), var(--tw-enter-scale, 1), var(--tw-enter-scale, 1))',
      },
    },
    '.animate-in': {
      animationName: 'enter',
      animationDuration: '150ms',
      '--tw-enter-opacity': 'initial',
      '--tw-enter-scale': 'initial',
      '--tw-enter-translate-x': 'initial',
      '--tw-enter-translate-y': 'initial',
    },
  });

  // Bộ chọn thuộc tính `[class~="duration-N"]` chứ không phải `.animate-in.duration-N`: viết dạng class ghép thì Tailwind
  // đăng ký luật dưới ứng viên `duration-N`, và `@apply duration-200` trong index.css (`.btn`, `.transition-base`,
  // `.menu-item`) kéo theo `.animate-in.btn`... — rác. Độ ưu tiên vẫn là (0,2,0), thắng `.animate-in` (0,1,0).
  const durations = theme('transitionDuration') || {};
  addUtilities(
    Object.fromEntries(
      Object.entries(durations)
        .filter(([key]) => key !== 'DEFAULT')
        .map(([key, value]) => [`.animate-in[class~="duration-${key}"]`, { animationDuration: value }])
    )
  );

  // `fade-in` (không số) = từ trong suốt hẳn; `fade-in-50` = từ 50%.
  matchUtilities({ 'fade-in': (value) => ({ '--tw-enter-opacity': value }) }, { values: { DEFAULT: '0', ...theme('opacity') } });
  // `zoom-in-95` = từ 95% kích thước.
  matchUtilities({ 'zoom-in': (value) => ({ '--tw-enter-scale': value }) }, { values: { DEFAULT: '0', ...theme('scale') } });
  // `slide-in-from-top-1` = từ trên xuống 0,25rem (số theo thang spacing); `-full` = 100%.
  const slideValues = { DEFAULT: '100%', ...theme('translate') };
  matchUtilities({ 'slide-in-from-top': (value) => ({ '--tw-enter-translate-y': `-${value}` }) }, { values: slideValues });
  matchUtilities({ 'slide-in-from-bottom': (value) => ({ '--tw-enter-translate-y': value }) }, { values: slideValues });
  matchUtilities({ 'slide-in-from-left': (value) => ({ '--tw-enter-translate-x': `-${value}` }) }, { values: slideValues });
  matchUtilities({ 'slide-in-from-right': (value) => ({ '--tw-enter-translate-x': value }) }, { values: slideValues });
});

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // App chỉ có giao diện sáng. Không khai báo thì Tailwind 3 mặc định 'media' → mọi class `dark:`
  // tự bật theo chế độ tối của hệ điều hành: 15/09/2026 trang Chương trình đối tác, trang quản lý
  // đối tác và modal rút tiền (~340 class dark:) hiện nền xanh đen giữa app nền trắng, khung cảnh
  // báo chữ vàng nhạt trên nền be không đọc được. 'class' = chỉ bật khi <html class="dark">,
  // chỉ gắn trên /app, /admin khi người dùng tự bật (themeStore.applyThemeToDocument).
  darkMode: 'class',
  theme: {
    extend: {
      // Tailwind 3 chỉ có spacing thập phân tới 3.5; mã viết theo kiểu Tailwind 4 (`p-4.5`, `w-4.5`)
      // sinh ra CSS rỗng → đệm 0, icon không có cỡ (10/10/2026: modal Sản phẩm sát lề). Bổ sung 4.5
      // thay vì sửa ~15 chỗ; chốt tailwindClassesExist.spec.js chặn mọi số thập phân khác.
      spacing: {
        4.5: '1.125rem',
      },
      // Tailwind 3 không có shadow-xs / shadow-2xs (có từ bản 4). Giá trị đúng như Tailwind 4:
      // 2xs là vệt mảnh nhất, xs ngang shadow-sm của bản 3.
      boxShadow: {
        '2xs': '0 1px rgb(0 0 0 / 0.05)',
        xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
      },
      colors: {
        dk: {
          inset: 'rgb(var(--dk-inset) / <alpha-value>)',
          bg: 'rgb(var(--dk-bg) / <alpha-value>)',
          surface: 'rgb(var(--dk-surface) / <alpha-value>)',
          raised: 'rgb(var(--dk-raised) / <alpha-value>)',
          strong: 'rgb(var(--dk-strong) / <alpha-value>)',
          border: 'rgb(var(--dk-border) / <alpha-value>)',
          'border-strong': 'rgb(var(--dk-border-strong) / <alpha-value>)',
          text: 'rgb(var(--dk-text) / <alpha-value>)',
          text2: 'rgb(var(--dk-text2) / <alpha-value>)',
          muted: 'rgb(var(--dk-muted) / <alpha-value>)',
        },
        primary: {
          50: '#fef7ee',
          100: '#fdedd6',
          200: '#fad7ac',
          300: '#f6bb78',
          400: '#f19342',
          500: '#ee7518',
          600: '#df5c0e',
          700: '#b9450e',
          800: '#933813',
          900: '#773013',
          950: '#401607',
        },
        /** Landing dark theme — token phẳng để JIT luôn sinh class (tránh lồng uknow-*-bg không áp dụng) */
        landing: {
          surface: '#0a0c12',
          card: '#111827',
          gold: '#eab308',
          muted: '#9ca3af',
        },
        secondary: {
          50: '#f6f7f9',
          100: '#eceef2',
          200: '#d5d9e2',
          300: '#b0b9c9',
          400: '#8593ab',
          500: '#667691',
          600: '#515f78',
          700: '#434d62',
          800: '#3a4253',
          900: '#333947',
          950: '#22262f',
        },
        founder: {
          teal: '#0b5563',
          'teal-mid': '#0e7a8a',
          'teal-light': '#13a8bd',
          'teal-cta': '#0d6e6e',
          gold: '#d4900a',
          'gold-light': '#f0b429',
          'gold-pale': '#fef7e7',
          ink: '#0c0f1a',
          paper: '#f7f5f0',
          cream: '#faf8f3',
          muted: '#6b6760',
          border: '#e2ddd5',
          red: '#c0392b',
          inklegacy: '#0a0a14',
          /** Footer / khóa học: dùng `bg-landing-*` trong component (đồng bộ ảnh 2) */
          'footer-logo-accent': '#f59e0b',
          'footer-muted': '#94a3b8',
          'course-label': '#eab308',
          'course-muted': '#9ca3af',
        },
        ai: {
          dark: '#0f172a',    // slate-900 (deep navy)
          darker: '#020617',  // slate-950 (blackish)
          neon: '#0ea5e9',    // sky-500
          purple: '#8b5cf6',  // violet-500
          magenta: '#d946ef', // fuchsia-500
          glass: 'rgba(255, 255, 255, 0.05)',
          border: 'rgba(255, 255, 255, 0.1)',
        }
      },
      fontFamily: {
        sans: ['Lexend', 'Inter', 'system-ui', 'sans-serif'],
        founder: ['Lexend', '"Be Vietnam Pro"', 'Inter', 'system-ui', 'sans-serif'],
        /** Trang landing `/l` — toàn bộ UI dùng Roboto */
        landing: ['Roboto', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
      },
      keyframes: {
        founderFadeUp: {
          from: { opacity: '0', transform: 'translateY(28px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        founderBlink: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.3', transform: 'scale(0.7)' },
        },
        founderFloat1: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        founderFloat2: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(8px)' },
        },
      },
      animation: {
        'founder-fade-up': 'founderFadeUp 0.7s ease both',
        'founder-blink': 'founderBlink 1.6s ease-in-out infinite',
        'founder-float-1': 'founderFloat1 3s ease-in-out infinite',
        'founder-float-2': 'founderFloat2 3.5s ease-in-out infinite',
      },
    },
  },
  plugins: [animateInPlugin],
}
