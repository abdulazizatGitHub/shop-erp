/** Tokens are defined in packages/ui/src/tokens. See docs/PROJECT_STRUCTURE.md §6.
 *  Never use arbitrary values (text-[#1a1a1a]) in components. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#14181F', muted: '#5A6472', faint: '#8B94A3' },
        surface: { DEFAULT: '#FFFFFF', sunken: '#F4F6F8' },
        line: { DEFAULT: '#DFE4EA', strong: '#B8C0CC' },
        brand: { DEFAULT: '#1B5E8C', hover: '#164E75', subtle: '#E7F0F6' },
        money: { in: '#116149', out: '#A32B1F', due: '#8A5B00' },
        focus: '#0B84FF',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        urdu: ['Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', 'serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      fontSize: {
        xs: ['13px', '18px'],
        sm: ['15px', '22px'],
        base: ['17px', '26px'],
        lg: ['20px', '28px'],
        xl: ['26px', '34px'],
        total: ['40px', '48px'],
      },
    },
  },
  plugins: [],
};
