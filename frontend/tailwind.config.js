/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:       '#0A0A0A',
        card:     '#111111',
        raised:   '#161616',
        hover:    '#1C1C1C',
        bdr:      '#242424',
        bdrhi:    '#333333',
        gold:     '#F5A623',
        'gold-d': '#C8831A',
        tx:       '#F0F0F0',
        'tx-m':   '#888888',
        'tx-f':   '#3A3A3A',
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body:    ['DM Sans', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
      },
      keyframes: {
        'slide-in': {
          from: { transform: 'translateX(100%)' },
          to:   { transform: 'translateX(0)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-dot': {
          '0%,100%': { opacity: '1' },
          '50%':      { opacity: '0.4' },
        },
      },
      animation: {
        'slide-in':  'slide-in .25s cubic-bezier(.16,1,.3,1)',
        shimmer:     'shimmer 3s linear infinite',
        'pulse-dot': 'pulse-dot 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
