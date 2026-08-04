/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f7ff',
          100: '#e0effe',
          500: '#0066cc',
          600: '#0052a3',
          700: '#003d7a',
          900: '#001f3f',
        },
        status: {
          planned: '#94a3b8',
          inProgress: '#3b82f6',
          completed: '#10b981',
          issue: '#f59e0b',
          blocked: '#ef4444',
          noWork: '#f1f5f9',
        }
      }
    },
  },
  plugins: [],
}
