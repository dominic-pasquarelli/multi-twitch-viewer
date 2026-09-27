interface AvatarProps {
  src?: string;
  name: string;
  size?: number;
  live?: boolean;
}

/** Round profile picture with a letter fallback and optional live ring. */
export function Avatar({ src, name, size = 28, live }: AvatarProps) {
  const style = {
    width: size,
    height: size,
    borderRadius: '50%',
    flex: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--surface-3)',
    fontSize: size * 0.45,
    fontWeight: 700,
    boxShadow: live ? '0 0 0 2px var(--live)' : undefined,
    objectFit: 'cover' as const,
  };
  return src ? (
    <img src={src} alt="" width={size} height={size} style={style} loading="lazy" />
  ) : (
    <span style={style} aria-hidden>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
