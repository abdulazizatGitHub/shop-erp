export interface TabItem<T extends string> {
  readonly key: T;
  readonly label: string;
}

export interface TabsProps<T extends string> {
  readonly items: readonly TabItem<T>[];
  readonly active: T;
  readonly onChange: (key: T) => void;
}

/** A horizontal tab bar — e.g. Suppliers' List / Add / Import sub-views. */
export function Tabs<T extends string>({
  items,
  active,
  onChange,
}: TabsProps<T>): React.JSX.Element {
  return (
    <div role="tablist" className="flex gap-1 border-b border-line">
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => {
              onChange(item.key);
            }}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'border-brand text-brand'
                : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
