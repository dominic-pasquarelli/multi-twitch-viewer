import { Headphones } from 'lucide-react';
import { usePlaybackEffects } from '@/state/playbackEffectsStore';
import { IconButton } from '@/ui/Button';

export function HoldToListen({ login }: { login: string }) {
  const active = usePlaybackEffects((s) => s.listen === login);
  const start = () => usePlaybackEffects.setState({ listen: login });
  const stop = () => {
    if (usePlaybackEffects.getState().listen === login)
      usePlaybackEffects.setState({ listen: null });
  };
  return (
    <IconButton
      size="sm"
      icon={<Headphones size={15} />}
      active={active}
      label={`Hold to listen to ${login} (Q)`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        start();
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onBlur={stop}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          stop();
        }
      }}
    />
  );
}
