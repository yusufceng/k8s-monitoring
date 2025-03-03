/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Light tema renkleri
        'primary-light': '#ffffff',
        'secondary-light': '#f3f4f6',
        'text-light': '#1f2937',
        
        // Dark tema renkleri
        'primary-dark': '#1f2937',
        'secondary-dark': '#374151',
        'text-dark': '#f3f4f6',
      },
    },
  },
  plugins: [],
}
