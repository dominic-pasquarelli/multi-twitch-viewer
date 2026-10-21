import { House } from 'lucide-react';
import { useViewStore } from '@/state/viewStore';
import { IconButton } from '@/ui/Button';
import { openHome, useLiveFavorites } from './useFavoritesHome';

/** Top bar: jump to the Favorites view (or set up favorites if there are none). */
export function HomeButton() {
  const home = useViewStore((s) => s.home);
  const { favorites, live } = useLiveFavorites();
  const label = !favorites.length
    ? 'Favorites view: star channels to fill it'
    : home
      ? `Favorites view (${live.length} of ${favorites.length} live): refresh it`
      : `Favorites view (${live.length} of ${favorites.length} live)`;
  return (
    <IconButton
      size="sm"
      label={`${label} (H)`}
      icon={<House size={16} />}
      active={home}
      onClick={openHome}
      data-testid="home-button"
    />
  );
}
