/** @type {import('tailwindcss').Config} */
// NOTE: Tailwind v4 is config-first via CSS (see src/index.css @theme).
// This file is kept for IDE tooling and any v4-compat tooling that reads it.
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#EEF2FD',
          100: '#D4DFFB',
          500: '#2D5BE3',
          600: '#1F47CC',
          700: '#1535A8',
        },
        todo: '#64748B',
        inprogress: '#D97706',
        done: '#16A34A',
      },
      fontFamily: {
        display: ['DM Sans', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.06)',
        'card-drag': '0 16px 32px rgba(0,0,0,0.16), 0 4px 8px rgba(0,0,0,0.08)',
      },
      borderRadius: {
        card: '8px',
      },
    },
  },
};
