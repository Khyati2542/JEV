/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // All surface/ink roles are CSS custom properties so light and dark
        // swap in one place (see src/index.css).
        page: 'var(--page)',
        surface: 'var(--surface-1)',
        raised: 'var(--surface-2)',
        ink: 'var(--text-primary)',
        'ink-2': 'var(--text-secondary)',
        muted: 'var(--muted)',
        hair: 'var(--border)',
        grid: 'var(--grid)',
        baseline: 'var(--baseline)',
        s1: 'var(--series-1)',
        s2: 'var(--series-2)',
        s3: 'var(--series-3)',
        s4: 'var(--series-4)',
        good: 'var(--status-good)',
        warn: 'var(--status-warning)',
        critical: 'var(--status-critical)',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
