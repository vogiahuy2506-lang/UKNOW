/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
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
        uknow: {
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
        uknow: ['Lexend', '"Be Vietnam Pro"', 'Inter', 'system-ui', 'sans-serif'],
        /** Trang landing `/l` — toàn bộ UI dùng Roboto */
        landing: ['Roboto', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
      },
      keyframes: {
        uknowFadeUp: {
          from: { opacity: '0', transform: 'translateY(28px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        uknowBlink: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.3', transform: 'scale(0.7)' },
        },
        uknowFloat1: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        uknowFloat2: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(8px)' },
        },
      },
      animation: {
        'uknow-fade-up': 'uknowFadeUp 0.7s ease both',
        'uknow-blink': 'uknowBlink 1.6s ease-in-out infinite',
        'uknow-float-1': 'uknowFloat1 3s ease-in-out infinite',
        'uknow-float-2': 'uknowFloat2 3.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
