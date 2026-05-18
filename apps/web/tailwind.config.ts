import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#111827',
          subtle: '#374151',
          muted: '#6B7280',
        },
        canvas: {
          DEFAULT: '#FAFAFB',
          card: '#FFFFFF',
          subtle: '#F3F4F6',
        },
        brand: {
          DEFAULT: '#4F46E5',
          hover: '#4338CA',
          subtle: '#EEF2FF',
        },
        kind: {
          llm: '#4F46E5',
          tool: '#0891B2',
          decision: '#7C3AED',
          handoff: '#D97706',
          internal: '#6B7280',
        },
        priority: {
          critical: '#DC2626',
          high: '#EA580C',
          medium: '#CA8A04',
          low: '#16A34A',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
