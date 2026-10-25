import { beforeEach, expect, it } from 'vitest';
import { useMusicDiscovery } from './musicDiscoveryStore';

beforeEach(() => useMusicDiscovery.setState({ userId: null, seen: {} }));

it('remembers music through a category change without unnecessary state changes', async () => {
  useMusicDiscovery.getState().observe('a', [{ id: '10', gameName: 'DJs' }]);
  const state = useMusicDiscovery.getState();
  state.observe('a', [{ id: '10', gameName: 'DJs' }]);
  expect(useMusicDiscovery.getState()).toBe(state);
  state.observe('a', [{ id: '10', gameName: 'Chess' }]);
  expect(useMusicDiscovery.getState().seen).toEqual({ '10': 'DJs' });
  const saved = await useMusicDiscovery.persist.getOptions().storage!.getItem('music-discovery');
  expect(saved?.state).toEqual({ userId: 'a', seen: { '10': 'DJs' } });
});

it('does not carry observed categories into a different account', () => {
  useMusicDiscovery.getState().observe('a', [{ id: '10', gameName: 'Music' }]);
  useMusicDiscovery.getState().observe('b', [{ id: '11', gameName: 'DJs' }]);
  expect(useMusicDiscovery.getState().seen).toEqual({ '11': 'DJs' });
  expect(useMusicDiscovery.getState().userId).toBe('b');
});
