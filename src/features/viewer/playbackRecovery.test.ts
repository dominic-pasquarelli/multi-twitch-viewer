import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PlaybackRecovery,
  PlayerReloadBudget,
  playbackRecovery,
  type RecoverySample,
} from './playbackRecovery';
import { intentionallyPaused, markInteraction } from './playerInteraction';
import { pauseAll, playAll, playerRegistry } from './playerRegistry';
import { MockPlayer } from '@/lib/player/mockPlayer';
import { PlayerController } from '@/lib/player/PlayerController';
import { useViewStore } from '@/state/viewStore';

const sample = (login: string, overrides: Partial<RecoverySample> = {}): RecoverySample => ({
  login,
  focused: false,
  muted: true,
  hidden: false,
  status: 'playing',
  stats: { bufferSize: 5, fps: 30 },
  ...overrides,
});

afterEach(() => {
  for (const [login, entry] of playerRegistry) {
    entry.controller.dispose();
    entry.adapter.destroy();
    playbackRecovery.forget(login);
  }
  playerRegistry.clear();
});

describe('bandwidth and group recovery', () => {
  it('requires sustained starvation; a low-latency but playing buffer is healthy', () => {
    let now = 0;
    const recovery = new PlaybackRecovery(() => now);
    const playing = sample('main', { focused: true, stats: { bufferSize: 0.1, fps: 30 } });
    expect(recovery.plan([playing]).degraded).toBe(false);
    now = 20_000;
    expect(recovery.plan([playing]).degraded).toBe(false);
    const stalled = { ...playing, stats: { bufferSize: 0.1, fps: 0 } };
    expect(recovery.plan([stalled]).degraded).toBe(false);
    now += 4000;
    expect(recovery.plan([stalled]).degraded).toBe(false);
    now += 2000;
    expect(recovery.plan([stalled]).degraded).toBe(true);
  });

  it('sheds muted streams while protecting focus and audible streams, then restarts gradually', () => {
    let now = 0;
    const recovery = new PlaybackRecovery(() => now);
    const samples = [
      sample('main', { focused: true }),
      sample('audio', { muted: false }),
      sample('b'),
      sample('c'),
    ];
    expect(recovery.plan(samples, false).pause).toEqual(['b', 'c']);
    const paused = samples.map((s) =>
      ['b', 'c'].includes(s.login) ? { ...s, status: 'paused' as const } : s,
    );
    now = 14_000;
    expect(recovery.plan(paused).resume).toEqual([]);
    now = 15_000;
    expect(recovery.plan(paused).resume).toEqual(['b']);
    now = 22_000;
    expect(recovery.plan(paused).resume).toEqual([]);
    now = 23_000;
    expect(recovery.plan(paused).resume).toEqual(['c']);
    now = 32_000;
    expect(recovery.plan(paused).degraded).toBe(true);
    now = 33_000;
    expect(recovery.plan(paused).degraded).toBe(false);
  });

  it('never lets recovery or returning to a group undo a manual pause', () => {
    let now = 0;
    const recovery = new PlaybackRecovery(() => now);
    recovery.pauseManually('manual');
    expect(intentionallyPaused('manual')).toBe(true);
    recovery.plan([sample('manual'), sample('other')], false);
    recovery.plan([sample('manual', { hidden: true }), sample('other', { hidden: true })]);
    now = 35_000;
    const plan = recovery.plan([
      sample('manual', { status: 'paused' }),
      sample('other', { status: 'paused' }),
    ]);
    expect(plan.resume).toEqual(['other']);
    expect(recovery.isManagedPause('manual')).toBe(true);
    recovery.forget('manual');
    expect(intentionallyPaused('manual')).toBe(false);
  });

  it('holds hidden groups and resumes only their previously playing streams on return', () => {
    const recovery = new PlaybackRecovery(() => 0);
    recovery.observeStatus('manual', 'paused', true);
    expect(
      recovery.plan([
        sample('other', { hidden: true }),
        sample('manual', { hidden: true, status: 'paused' }),
      ]).pause,
    ).toEqual(['other']);
    expect(
      recovery.plan([sample('other', { status: 'paused' }), sample('manual', { status: 'paused' })])
        .resume,
    ).toEqual(['other']);
    recovery.forget('manual');
  });

  it('promoting a network-paused stream releases its temporary hold', () => {
    const recovery = new PlaybackRecovery(() => 0);
    recovery.plan([sample('a')], false);
    expect(recovery.plan([sample('a', { focused: true, status: 'paused' })]).resume).toEqual(['a']);
  });

  it('treats repeated unrequested pauses as pressure, but ignores deliberate pauses', () => {
    const recovery = new PlaybackRecovery(() => 0);
    recovery.observeStatus('user', 'paused', true);
    recovery.observeStatus('user', 'paused', true);
    expect(recovery.plan([sample('user'), sample('a')]).degraded).toBe(false);
    recovery.observeStatus('a', 'paused', false);
    recovery.observeStatus('a', 'paused', false);
    expect(recovery.plan([sample('user'), sample('a')]).degraded).toBe(true);
    recovery.forget('user');
  });

  it('retains manual pause intent on an embed remount until a new play interaction', () => {
    let now = 0;
    const recovery = new PlaybackRecovery(() => now);
    markInteraction('manual', now);
    recovery.observeStatus('manual', 'paused', true);
    recovery.observeStatus('manual', 'playing', true); // autoplay after remount
    expect(recovery.isManagedPause('manual')).toBe(true);
    now = 1000;
    markInteraction('manual', now);
    recovery.observeStatus('manual', 'playing', true);
    expect(recovery.isManagedPause('manual')).toBe(false);
    recovery.forget('manual');
  });
});

it('bounds reloads per channel across remounts with backoff and a cooldown', () => {
  let now = 0;
  const budget = new PlayerReloadBudget(() => now);
  expect(budget.nextDelay('a')).toBe(1000);
  expect(budget.nextDelay('a')).toBeNull();
  expect(budget.nextDelay('b')).toBe(1000);
  now = 15_000;
  expect(budget.nextDelay('a')).toBe(4000);
  now = 30_000;
  expect(budget.nextDelay('a')).toBe(12_000);
  now = 45_000;
  expect(budget.nextDelay('a')).toBeNull();
  now = 331_000;
  expect(budget.nextDelay('a')).toBe(1000);
});

it('Pause all persists and Play all respects hidden/recovery holds', async () => {
  for (const login of ['shown', 'hidden']) {
    const adapter = new MockPlayer(document.createElement('div'), login, true, { readyDelay: 0 });
    const controller = new PlayerController(adapter, { muted: true, volume: 0.5, quality: null });
    playerRegistry.set(login, { adapter, controller });
  }
  await Promise.resolve();
  playbackRecovery.plan([sample('shown'), sample('hidden', { hidden: true })]);
  pauseAll();
  expect(intentionallyPaused('shown')).toBe(true);
  expect((playerRegistry.get('shown')!.adapter as MockPlayer).paused).toBe(true);
  const hiddenPlay = vi.spyOn(playerRegistry.get('hidden')!.adapter, 'play');
  playAll();
  expect(intentionallyPaused('shown')).toBe(false);
  expect((playerRegistry.get('shown')!.adapter as MockPlayer).paused).toBe(false);
  expect(hiddenPlay).not.toHaveBeenCalled();
});

it('Play all follows an immediate tab switch and closing clears prior pause intent', async () => {
  const previous = useViewStore.getState().view;
  try {
    const store = useViewStore.getState();
    store.watchOnly(['one', 'two']);
    const oneGroup = store.createGroup('One');
    const twoGroup = store.createGroup('Two');
    store.assignGroup('one', oneGroup);
    store.assignGroup('two', twoGroup);
    store.setActiveGroup(oneGroup);
    for (const login of ['one', 'two']) {
      const adapter = new MockPlayer(document.createElement('div'), login, true, { readyDelay: 0 });
      const controller = new PlayerController(adapter, { muted: true, volume: 0.5, quality: null });
      playerRegistry.set(login, { adapter, controller });
    }
    await Promise.resolve();
    playbackRecovery.plan([sample('one'), sample('two', { hidden: true })]);
    pauseAll();
    const playOne = vi.spyOn(playerRegistry.get('one')!.adapter, 'play');
    const playTwo = vi.spyOn(playerRegistry.get('two')!.adapter, 'play');
    store.setActiveGroup(twoGroup);
    playAll(); // no recovery interval has run yet
    expect(playOne).not.toHaveBeenCalled();
    expect(playTwo).toHaveBeenCalledOnce();
    playbackRecovery.pauseManually('two');
    store.removeChannel('two');
    expect(intentionallyPaused('two')).toBe(false);
    expect(playbackRecovery.isManagedPause('two')).toBe(false);
  } finally {
    useViewStore.setState({ view: previous });
  }
});
