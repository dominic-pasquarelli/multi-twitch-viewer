import { expect, it } from 'vitest';
import { createMockApi, setMockLive } from './mockApi';

it('keeps live status and valid timestamps for historical channels outside the followed list', async () => {
  const api = createMockApi();
  const [live] = await api.getStreamsByLogins(['historical_test_channel']);
  expect(live?.login).toBe('historical_test_channel');
  expect(Number.isFinite(Date.parse(live!.startedAt))).toBe(true);
  setMockLive('historical_test_channel', false);
  await expect(api.getStreamsByLogins(['historical_test_channel'])).resolves.toEqual([]);
  expect(
    (await api.getFollowedChannels('42')).some((c) => c.login === 'historical_test_channel'),
  ).toBe(false);
  setMockLive('historical_test_channel', true);
});
