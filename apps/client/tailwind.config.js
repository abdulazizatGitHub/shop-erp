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
        // faint was #8B94A3 (2.9:1 on white) — below the 4.5:1 minimum for
        // text under 18pt (HIG accessibility.md). Darkened to keep the
        // faint/muted/DEFAULT hierarchy while passing contrast.
        ink: { DEFAULT: '#14181F', muted: '#5A6472', faint: '#64707F' },
        surface: { DEFAULT: '#FFFFFF', sunken: '#F4F6F8', page: '#F2F4F7', input: '#F7F8FA' },
        line: { DEFAULT: '#DFE4EA', strong: '#B8C0CC' },
        sidebar: { bg: '#1E2235', text: '#9AA0B8', active: '#6FA8FF' },
        brand: { DEFAULT: '#1B5E8C', hover: '#164E75', subtle: '#E7F0F6' },
        // Sale-screen-only accent (A-1) — see colors.ts for why this is
        // separate from `brand`.
        'pos-accent': {
          DEFAULT: '#2563EB',
          hover: '#1D4ED8',
          subtle: '#EFF4FF',
          border: '#BFCFFE',
        },
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
        // Dense UI chrome (badges, kbd hints, eyebrow labels, meta rows —
        // mostly on the Sale screen) sat below `xs` with no token to reach
        // for, so components filled the gap with a dozen one-off
        // text-[Npx] values. These three follow macOS's own built-in text
        // styles (HIG typography.md) — caption/footnote share 10/13pt,
        // subheadline is 11/14pt, callout is 12/15pt — and 10px is also
        // the platform's minimum legible size, so `caption` is the floor:
        // nothing in the app should go smaller.
        caption: ['10px', '13px'],
        subheadline: ['11px', '14px'],
        callout: ['12px', '15px'],
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
