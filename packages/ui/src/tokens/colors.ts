/**
 * Single source of truth for colour. Mirrored in apps/client/tailwind.config.js.
 * If you change one, change both. Never use a raw hex in a component.
 */
export const colors = {
  ink: { default: '#14181F', muted: '#5A6472', faint: '#8B94A3' },
  surface: {
    default: '#FFFFFF',
    sunken: '#F4F6F8',
    /** Page/canvas background behind panels — distinct from `sunken` (used inside panels). */
    page: '#F2F4F7',
    /** Input and row background inside a white panel. */
    input: '#F7F8FA',
  },
  line: { default: '#DFE4EA', strong: '#B8C0CC' },
  /** Dark navigation chrome — the sidebar only. Never used on main content. */
  sidebar: { bg: '#1E2235', text: '#9AA0B8', active: '#6FA8FF' },
  brand: { default: '#1B5E8C', hover: '#164E75', subtle: '#E7F0F6' },
  /**
   * Sale-screen-only accent (A-1 Apple-style redesign). Deliberately
   * separate from `brand` so this session's redesign doesn't recolour the
   * rest of the app — see PROJECT.md "UI Redesign State" for the decision.
   */
  posAccent: { default: '#2563EB', hover: '#1D4ED8', subtle: '#EFF4FF', border: '#BFCFFE' },
  /** Semantic, never decorative. in = received, out = paid, due = outstanding. */
  money: { in: '#116149', out: '#A32B1F', due: '#8A5B00' },
  /** UI state colours — kept distinct from `money` even where values are close,
   *  so the two vocabularies never collide in a className. */
  danger: { default: '#B3261E', subtle: '#FBEAE9' },
  warning: { default: '#9A6300', subtle: '#FBF0DA' },
  success: { default: '#146C43', subtle: '#E7F5EC' },
  focus: '#0B84FF',
} as const;
