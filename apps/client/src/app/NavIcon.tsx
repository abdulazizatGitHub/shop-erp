import type { Tab } from './navigation.js';

const SHARED_PROPS = {
  viewBox: '0 0 24 24',
  width: 18,
  height: 18,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** One small, deliberately simple placeholder glyph per nav item — no icon-library dependency. */
export function NavIcon({ tab }: { readonly tab: Tab }): React.JSX.Element {
  switch (tab) {
    case 'sales':
      return (
        <svg {...SHARED_PROPS} aria-hidden="true">
          <path d="M3 4h2l2 10h10l2-8H6" />
          <circle cx="9" cy="20" r="1" />
          <circle cx="17" cy="20" r="1" />
        </svg>
      );
    case 'items':
      return (
        <svg {...SHARED_PROPS} aria-hidden="true">
          <rect x="4" y="7" width="16" height="13" />
          <polyline points="4 7 12 3 20 7" />
          <line x1="12" y1="3" x2="12" y2="13" />
        </svg>
      );
    case 'suppliers':
      return (
        <svg {...SHARED_PROPS} aria-hidden="true">
          <rect x="2" y="8" width="13" height="8" />
          <path d="M15 11h4l3 3v2h-7z" />
          <circle cx="6.5" cy="17.5" r="1.5" />
          <circle cx="17.5" cy="17.5" r="1.5" />
        </svg>
      );
    case 'purchases':
      return (
        <svg {...SHARED_PROPS} aria-hidden="true">
          <rect x="5" y="3" width="14" height="18" rx="1" />
          <line x1="8" y1="8" x2="16" y2="8" />
          <line x1="8" y1="12" x2="16" y2="12" />
          <line x1="8" y1="16" x2="13" y2="16" />
        </svg>
      );
    case 'reports':
      return (
        <svg {...SHARED_PROPS} aria-hidden="true">
          <line x1="4" y1="20" x2="20" y2="20" />
          <rect x="6" y="13" width="3" height="7" />
          <rect x="11" y="9" width="3" height="11" />
          <rect x="16" y="5" width="3" height="15" />
        </svg>
      );
    case 'customers':
      return (
        <svg {...SHARED_PROPS} aria-hidden="true">
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M15.5 14a5 5 0 0 1 5 5" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...SHARED_PROPS} aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <circle cx="12" cy="12" r="8" strokeDasharray="2 3" />
        </svg>
      );
  }
}
