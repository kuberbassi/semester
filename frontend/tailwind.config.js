/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // RGB-channel Material 3 System Colors — full Tailwind opacity modifier support (/5, /10, /[0.08], etc.)
        primary: {
          DEFAULT: 'rgb(var(--rgb-primary) / <alpha-value>)',
          container: 'rgb(var(--rgb-primary-container) / <alpha-value>)',
          'on-container': 'rgb(var(--rgb-on-primary-container) / <alpha-value>)',
        },
        'on-primary': 'rgb(var(--rgb-on-primary) / <alpha-value>)',

        secondary: {
          DEFAULT: 'rgb(var(--rgb-secondary) / <alpha-value>)',
          container: 'rgb(var(--rgb-secondary-container) / <alpha-value>)',
          'on-container': 'rgb(var(--rgb-on-secondary-container) / <alpha-value>)',
        },
        'on-secondary': 'rgb(var(--rgb-on-secondary) / <alpha-value>)',

        tertiary: {
          DEFAULT: 'rgb(var(--rgb-tertiary) / <alpha-value>)',
          container: 'rgb(var(--rgb-tertiary-container) / <alpha-value>)',
          'on-container': 'rgb(var(--rgb-on-tertiary-container) / <alpha-value>)',
        },
        'on-tertiary': 'rgb(var(--rgb-on-tertiary) / <alpha-value>)',

        error: {
          DEFAULT: 'rgb(var(--rgb-error) / <alpha-value>)',
          container: 'rgb(var(--rgb-error-container) / <alpha-value>)',
          'on-container': 'rgb(var(--rgb-on-error-container) / <alpha-value>)',
        },
        'on-error': 'rgb(var(--rgb-on-error) / <alpha-value>)',

        background: 'rgb(var(--rgb-background) / <alpha-value>)',
        'on-background': 'rgb(var(--rgb-on-background) / <alpha-value>)',

        surface: {
          DEFAULT: 'rgb(var(--rgb-surface) / <alpha-value>)',
          variant: 'rgb(var(--rgb-surface-variant) / <alpha-value>)',
          container: 'rgb(var(--rgb-surface-container) / <alpha-value>)',
          'container-low': 'rgb(var(--rgb-surface-container-low) / <alpha-value>)',
          'container-high': 'rgb(var(--rgb-surface-container-high) / <alpha-value>)',
          'container-highest': 'rgb(var(--rgb-surface-container-highest) / <alpha-value>)',
          dim: 'rgb(var(--rgb-surface-dim) / <alpha-value>)',
        },
        'on-surface': 'rgb(var(--rgb-on-surface) / <alpha-value>)',
        'on-surface-variant': 'rgb(var(--rgb-on-surface-variant) / <alpha-value>)',

        outline: 'rgb(var(--rgb-outline) / <alpha-value>)',
        'outline-variant': 'rgb(var(--rgb-outline-variant) / <alpha-value>)',
      },

      fontFamily: {
        sans: ['Outfit', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Bricolage Grotesque"', 'Outfit', 'system-ui', 'sans-serif'],
      },

      opacity: {
        '12': '0.12',
        '14': '0.14',
        '16': '0.16',
        '18': '0.18',
        '22': '0.22',
        '28': '0.28',
        '88': '0.88',
        '92': '0.92',
      },

      borderRadius: {
        'none': '0px',
        'xs': '4px',
        'sm': '6px',
        'DEFAULT': '10px',
        'md': '10px',
        'lg': '16px',
        'xl': '20px',
        '2xl': '24px',
        '3xl': '32px',
        'full': '9999px',
      },

      backdropBlur: {
        'xs': '2px',
        'DEFAULT': '8px',
      },

      animation: {
        'float': 'float 3s ease-in-out infinite',
        'fade-in': 'fadeIn 0.25s ease-out',
        'slide-up': 'slideUp 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
        'scale-in': 'scaleIn 0.24s cubic-bezier(0.22, 1, 0.36, 1)',
      },

      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },

      transitionTimingFunction: {
        'bounce': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'smooth': 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
}
