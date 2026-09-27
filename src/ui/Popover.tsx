import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';

interface PopoverProps {
  open: boolean;
  onClose(): void;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Elements that should not count as "outside" (e.g. the toggle button). */
  ignoreRefs?: React.RefObject<HTMLElement | null>[];
}

/** A floating panel that closes on outside click or Escape. */
export function Popover({
  open,
  onClose,
  children,
  className,
  style,
  ignoreRefs = [],
}: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const ignore = useRef(ignoreRefs);
  useLayoutEffect(() => {
    ignore.current = ignoreRefs;
  });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (ignore.current.some((r) => r.current?.contains(target))) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // Clicking into a player iframe blurs the window: treat as outside.
    const onBlur = () => onClose();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onBlur);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div ref={ref} className={className} style={style} role="dialog">
      {children}
    </div>
  );
}
