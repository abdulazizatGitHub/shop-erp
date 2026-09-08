import { Modal } from '@shop/ui';

export interface HelpShortcutsModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

interface Shortcut {
  readonly keys: readonly string[];
  readonly description: string;
}

const SHORTCUTS: readonly Shortcut[] = [
  { keys: ['↑', '↓'], description: 'Navigate search results' },
  { keys: ['Enter'], description: 'Select item / confirm qty' },
  { keys: ['Tab'], description: 'Select item (same as Enter)' },
  { keys: ['Esc'], description: 'Clear search / cancel qty' },
  { keys: ['C'], description: 'Set payment to Cash' },
  { keys: ['U'], description: 'Set payment to Udhaar' },
  { keys: ['F10'], description: 'Complete sale' },
  { keys: ['?'], description: 'Show this help' },
  { keys: ['Alt', '1..7'], description: 'Navigate to a section' },
  { keys: ['Alt', '\\'], description: 'Expand/collapse sidebar' },
];

/** Two-column reference of the sale screen's keyboard shortcuts, opened by "?" or the topbar's Help button. */
export function HelpShortcutsModal({ open, onClose }: HelpShortcutsModalProps): React.JSX.Element {
  return (
    <Modal open={open} title="Keyboard shortcuts" onClose={onClose}>
      <table className="w-full text-sm">
        <tbody>
          {SHORTCUTS.map((shortcut) => (
            <tr key={shortcut.description} className="border-b border-line last:border-b-0">
              <td className="whitespace-nowrap py-2 pr-4 align-top">
                {shortcut.keys.map((key, i) => (
                  <span key={key}>
                    {i > 0 && <span className="mx-1 text-ink-faint">+</span>}
                    <kbd className="rounded border border-line bg-surface-input px-1.5 py-0.5 font-mono text-xs">
                      {key}
                    </kbd>
                  </span>
                ))}
              </td>
              <td className="py-2 text-ink-muted">{shortcut.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
