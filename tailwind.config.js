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
          cream:        '#F9F7F4',
          'cream-mid':  '#EDE6DC',
          'cream-dark': '#DDD5C8',
          green:        '#2C4A2E',
          'green-mid':  '#3D5A3E',
          'green-light':'#5A6B5C',
          'green-muted':'#8C9E8E',
          copper:       '#B87C5A',
          'copper-light':'#EDE0D4',
          white:        '#FFFFFF',
        },
      },
      fontFamily: {
        serif: ["'Playfair Display'", 'Georgia', 'serif'],
        sans:  ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
