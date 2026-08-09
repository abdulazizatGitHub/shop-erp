/**
 * Single source of truth for colour. Mirrored in apps/client/tailwind.config.js.
 * If you change one, change both. Never use a raw hex in a component.
 */
export const colors = {
  ink: { default: '#14181F', muted: '#5A6472', faint: '#8B94A3' },
  surface: { default: '#FFFFFF', sunken: '#F4F6F8' },
  line: { default: '#DFE4EA', strong: '#B8C0CC' },
  brand: { default: '#1B5E8C', hover: '#164E75', subtle: '#E7F0F6' },
  /** Semantic, never decorative. in = received, out = paid, due = outstanding. */
  money: { in: '#116149', out: '#A32B1F', due: '#8A5B00' },
  focus: '#0B84FF',
} as const;
