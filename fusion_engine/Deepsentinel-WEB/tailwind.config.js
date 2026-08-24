/** @type {import('tailwindcss').Config} */

/**
 * Design tokens.
 *
 * Components reference semantic names (surface, risk-critical) rather than raw
 * values, so a palette change happens here and nowhere else. Before this,
 * `style={{ background: 'rgba(255,255,255,0.02)' }}` was repeated across every
 * component with no single place to change it.
 */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Editorial accent. A single saturated blue carries emphasis in
        // headings, tags and links, against an otherwise achromatic page —
        // so colour always means "look here" rather than decoration.
        // Teal, not blue. Every dashboard is blue; teal reads as considered
        // rather than default, and it stays clear of the risk ramp's red /
        // orange / yellow / green so an accent is never mistaken for a
        // severity. Steps differ per theme so contrast holds on both grounds.
        accent: {
          400: 'rgb(var(--accent-400) / <alpha-value>)',
          500: 'rgb(var(--accent-500) / <alpha-value>)',
          600: 'rgb(var(--accent-600) / <alpha-value>)',
        },

        // Canvas layers. Values come from CSS variables so the whole app
        // re-themes without a single `dark:` variant in a component.
        sentinel: {
          950: 'rgb(var(--sentinel-950) / <alpha-value>)',
          900: 'rgb(var(--sentinel-900) / <alpha-value>)',
          800: 'rgb(var(--sentinel-800) / <alpha-value>)',
          700: 'rgb(var(--sentinel-700) / <alpha-value>)',
          600: 'rgb(var(--sentinel-600) / <alpha-value>)',
        },

        // Text ramp. Inverted between themes, so a given step always means
        // the same amount of emphasis.
        slate: {
          200: 'rgb(var(--slate-200) / <alpha-value>)',
          300: 'rgb(var(--slate-300) / <alpha-value>)',
          400: 'rgb(var(--slate-400) / <alpha-value>)',
          500: 'rgb(var(--slate-500) / <alpha-value>)',
          600: 'rgb(var(--slate-600) / <alpha-value>)',
          700: 'rgb(var(--slate-700) / <alpha-value>)',
        },

        // Elevation. Translucent ink over the canvas — white on dark, near
        // black on light.
        surface: {
          DEFAULT: 'rgb(var(--surface))',
          raised: 'rgb(var(--surface-raised))',
          overlay: 'rgb(var(--surface-overlay))',
          hover: 'rgb(var(--surface-hover))',
        },

        // Risk classification. These carry meaning — one hue per severity,
        // used consistently across gauges, badges, tables and email.
        risk: {
          critical: '#ef4444',
          high: '#f97316',
          medium: '#eab308',
          low: '#22c55e',
          unknown: '#64748b',
        },

        // Per-modality identity, so a colour always means the same model
        modality: {
          graph: 'rgb(var(--modality-graph) / <alpha-value>)',
          behavioral: 'rgb(var(--modality-behavioral) / <alpha-value>)',
          temporal: 'rgb(var(--modality-temporal) / <alpha-value>)',
        },

        // Role identity in the user table and badges
        role: {
          admin: 'rgb(var(--modality-graph) / <alpha-value>)',
          manager: 'rgb(var(--modality-behavioral) / <alpha-value>)',
          analyst: '#64748b',
        },
      },

      borderColor: {
        subtle: 'rgb(var(--border-subtle))',
        strong: 'rgb(var(--border-strong))',
      },

      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },

      animation: {
        'fade-in': 'fadeIn 200ms ease-out',
        'slide-up': 'slideUp 250ms cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-ring': 'pulseRing 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },

      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        pulseRing: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
    },
  },
  plugins: [],
}
