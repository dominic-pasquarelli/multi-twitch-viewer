import type { KeyboardEvent, ReactNode } from 'react';
import styles from './Tabs.module.css';

export interface Tab<Id extends string> {
  id: Id;
  label: string;
}

/**
 * A row of tabs (ARIA tablist). The caller renders the active panel with
 * `<TabPanel id>`. Arrow keys move between tabs.
 */
export function Tabs<Id extends string>({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: Tab<Id>[];
  active: Id;
  onChange(id: Id): void;
  label: string;
}) {
  const onKeyDown = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === active);
    const next =
      e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : null;
    if (next === null) return;
    e.preventDefault();
    const tab = tabs[(next + tabs.length) % tabs.length]!;
    onChange(tab.id);
    document.getElementById(`tab-${tab.id}`)?.focus();
  };
  return (
    <div className={styles.tabs} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map((t) => (
        <button
          key={t.id}
          id={`tab-${t.id}`}
          role="tab"
          type="button"
          className={styles.tab}
          aria-selected={t.id === active}
          aria-controls={`tabpanel-${t.id}`}
          tabIndex={t.id === active ? 0 : -1}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** The content of one tab (render only the active one). */
export function TabPanel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div id={`tabpanel-${id}`} role="tabpanel" aria-labelledby={`tab-${id}`}>
      {children}
    </div>
  );
}
