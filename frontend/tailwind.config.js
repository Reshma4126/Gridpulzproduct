/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./**/*.html",
    "./**/*.js",
    "./components/**/*.css",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        neon: '#CCFF00',
        alert: '#FF4444',
        dark: {
          bg: '#131313',
          surface: '#1b1b1b',
          border: '#353535',
        },
        muted: '#aaaaaa',
        'surface-variant': '#35343a',
        'on-surface-variant': '#c3caac',
        'surface-dim': '#131318',
        'primary-fixed': '#b8f600',
        'on-background': '#e4e1e9',
        'on-surface': '#e4e1e9',
        'outline': '#8d9479',
        'background': '#131318',
        'error': '#ffb4ab',
        'surface': '#131318',
        'surface-container': '#1f1f25',
      },
      fontFamily: {
        headline: ['Michroma', 'monospace'],
        body: ['Josefin Sans', 'sans-serif'],
        mono: ['Michroma', 'monospace'],
        michroma: ['Michroma', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
