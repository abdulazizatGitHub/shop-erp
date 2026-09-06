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
    case 'jobs':
      return (
        <svg {...SHARED_PROPS} aria-hidden="true">
          <path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 1 5.4-5.4l-2.2 2.2-2-2z" />
        </svg>
      );
    case 'technician-custody':
      return (
        <svg {...SHARED_PROPS} aria-hidden="true">
          <rect x="5" y="8" width="14" height="12" rx="1" />
          <path d="M9 8V6a3 3 0 0 1 6 0v2" />
        </svg>
      );
    case 'staff':
      return (
        <svg {...SHARED_PROPS} aria-hidden="true">
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" />
        </svg>
      );
    case 'expenses':
      return (
        <svg {...SHARED_PROPS} aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v10M9.5 9.5a2.5 2.5 0 0 1 2.5-1h.3a2.2 2.2 0 0 1 0 4.4h-.6a2.2 2.2 0 0 0 0 4.4h.3a2.5 2.5 0 0 0 2.5-1" />
        </svg>
      );
    case 'dashboard':
      return (
        <svg {...SHARED_PROPS} aria-hidden="true">
          <rect x="3" y="3" width="8" height="8" rx="1" />
          <rect x="13" y="3" width="8" height="5" rx="1" />
          <rect x="13" y="10" width="8" height="11" rx="1" />
          <rect x="3" y="13" width="8" height="8" rx="1" />
        </svg>
      );
    case 'attendance':
      return (
        <svg {...SHARED_PROPS} aria-hidden="true">
          <rect x="3" y="4" width="18" height="17" rx="1" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <path d="M7 13l2.5 2.5L15 10" />
        </svg>
      );
  }
}
