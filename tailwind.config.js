/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        wcs: {
          green: '#1B3A2D',
          copper: '#C8873C',
          cream: '#F9F6F1',
        },
      },
      fontFamily: {
        serif: ['Georgia', 'Times New Roman', 'serif'],
        sans: ['system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
