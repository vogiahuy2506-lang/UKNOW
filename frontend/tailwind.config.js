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
          teal: '#0d6e6e',
          'teal-light': '#12a0a0',
          gold: '#e8a020',
          ink: '#0a0a14',
          cream: '#faf8f4',
          muted: '#6b6860',
          border: '#e0dbd2',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        uknow: ['"Be Vietnam Pro"', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
