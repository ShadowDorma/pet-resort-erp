/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          light: '#CAE9FF',
          DEFAULT: '#5FA8D3',
          dark: '#1B4965',
        },
        secondary: {
          light: '#BEE9E8',
          DEFAULT: '#62B6CB',
        },
        accent: {
          sage: '#BACDBA',
          sand: '#F7E7CE',
          purple: '#576490',
        },
        background: '#F4F7F6',
      },
    },
  },
  plugins: [],
}
