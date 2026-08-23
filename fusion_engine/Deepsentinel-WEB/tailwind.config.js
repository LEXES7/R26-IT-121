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
        // Base canvas, darkest to lightest
        sentinel: {
          950: '#06091a',
          900: '#0a0f1e',
          800: '#0f172a',
          700: '#1e293b',
          600: '#334155',
        },

        // Elevation. Layered translucent white over the canvas.
        surface: {
          DEFAULT: 'rgba(255,255,255,0.02)',
          raised: 'rgba(255,255,255,0.04)',
          overlay: 'rgba(255,255,255,0.06)',
          hover: 'rgba(255,255,255,0.08)',
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
          graph: '#a855f7',      // GraphSAGE — network/relational
          behavioral: '#3b82f6', // VAE/DSAA — behavioural
          temporal: '#06b6d4',   // TCN/TSCFD — temporal
        },

        // Role identity in the user table and badges
        role: {
          admin: '#a855f7',
          manager: '#3b82f6',
          analyst: '#64748b',
        },
      },

      borderColor: {
        subtle: 'rgba(255,255,255,0.07)',
        strong: 'rgba(255,255,255,0.14)',
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
