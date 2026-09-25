import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        fluent: {
          dark: '#000000',
          darker: '#000000',
          card: '#0c0c10',
          cardBorder: '#1c1c24',
          light: '#f8fafc',
          lightCard: '#ffffff',
          lightBorder: '#e2e8f0',
          accent: '#3b82f6',
          accentHover: '#2563eb',
        },
      },
      fontFamily: {
        sans: [
          'Segoe UI Variable',
          'Segoe UI',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif',
        ],
      },
      boxShadow: {
        subtle: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
        card: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
        glow: '0 0 15px -3px rgba(59, 130, 246, 0.3)',
      },
    },
  },
  plugins: [],
}

export default config
