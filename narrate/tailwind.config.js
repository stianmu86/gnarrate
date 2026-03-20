/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Light Mode — Linen & Oak
        linen: '#F7F3F0',
        alabaster: '#FFFFFF',
        charcoal: '#2D2926',
        stone: '#8E8883',
        terracotta: '#C67B5C',
        fjord: '#4A6070',
        birch: '#EAE2D9',

        // Dark Mode — Midnight Cabin
        'night-forest': '#1B1D1C',
        'smoked-oak': '#262928',
        sand: '#D6CFC7',
        moss: '#70736A',
        amber: '#D4A373',
        'dark-birch': '#2D312F',

        // Dark mode fjord variant
        'fjord-dark': '#6A8A9A',
      },
      fontFamily: {
        newsreader: ['Newsreader'],
        inter: ['Inter'],
      },
      borderRadius: {
        nordic: '24px',    // Cards, modals
        'nordic-md': '16px', // Buttons, inputs
        'nordic-sm': '40px', // Pills, tags (fully rounded)
      },
      spacing: {
        'page': '24px',    // Outer page padding
        'card': '20px',    // Card internal padding
        'section': '32px', // Section gaps
      },
      boxShadow: {
        nordic: '0 4px 20px rgba(45, 41, 38, 0.05)',
      },
      transitionDuration: {
        page: '300ms',
        press: '150ms',
      },
      transitionTimingFunction: {
        nordic: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      fontSize: {
        'display-1': ['32px', { lineHeight: '1.2', fontWeight: '500' }],
        'article-title': ['20px', { lineHeight: '1.3', fontWeight: '600' }],
        'body-reading': ['18px', { lineHeight: '1.6', fontWeight: '400' }],
        'ui-label': ['14px', { lineHeight: '1.0', fontWeight: '600' }],
        'metadata': ['12px', { lineHeight: '1.0', fontWeight: '500' }],
      },
    },
  },
  plugins: [],
};
