/** Tokens are defined in packages/ui/src/tokens. See docs/PROJECT_STRUCTURE.md §6.
 *  Never use arbitrary values (text-[#1a1a1a]) in components. */
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Content globs must be absolute, not relative to process.cwd(): apps/server's
// electron-vite build runs this config with root: '../client' but cwd stays
// apps/server, so a relative glob here would resolve against the wrong
// directory and silently produce zero matches (base reset only, every
// utility class purged) in the actual packaged app.
const here = path.dirname(fileURLToPath(import.meta.url));

export default {
  content: [
    path.join(here, 'index.html'),
    path.join(here, 'src/**/*.{ts,tsx}'),
    path.join(here, '../../packages/ui/src/**/*.{ts,tsx}'),
  ],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#14181F', muted: '#5A6472', faint: '#8B94A3' },
        surface: { DEFAULT: '#FFFFFF', sunken: '#F4F6F8' },
        line: { DEFAULT: '#DFE4EA', strong: '#B8C0CC' },
        brand: { DEFAULT: '#1B5E8C', hover: '#164E75', subtle: '#E7F0F6' },
        money: { in: '#116149', out: '#A32B1F', due: '#8A5B00' },
        danger: { DEFAULT: '#B3261E', subtle: '#FBEAE9' },
        warning: { DEFAULT: '#9A6300', subtle: '#FBF0DA' },
        success: { DEFAULT: '#146C43', subtle: '#E7F5EC' },
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
