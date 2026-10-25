import { describe, expect, it } from 'vitest';
import { normalizeChannel, normalizeLogin, parseChannelInput } from './parseChannels';

describe('normalizeLogin', () => {
  it('lowercases, trims and strips @', () => {
    expect(normalizeLogin('  @Shroud ')).toBe('shroud');
  });
  it('rejects invalid names', () => {
    expect(normalizeLogin('no spaces')).toBeNull();
    expect(normalizeLogin('bad-name')).toBeNull();
    expect(normalizeLogin('a'.repeat(26))).toBeNull();
    expect(normalizeLogin('')).toBeNull();
  });
});

describe('parseChannelInput', () => {
  it('parses separated names and removes duplicates', () => {
    expect(parseChannelInput('xqc, Shroud;pokimane\nxqc')).toEqual(['xqc', 'shroud', 'pokimane']);
  });

  it('parses twitch links', () => {
    expect(
      parseChannelInput(
        'https://www.twitch.tv/Lirik twitch.tv/summit1g/videos m.twitch.tv/sodapoppin https://www.twitch.tv/popout/moonmoon/chat',
      ),
    ).toEqual(['lirik', 'summit1g', 'sodapoppin', 'moonmoon']);
  });

  it('parses player and multi-stream links', () => {
    expect(parseChannelInput('https://player.twitch.tv/?channel=esl_csgo&parent=x')).toEqual([
      'esl_csgo',
    ]);
    expect(parseChannelInput('https://www.multitwitch.tv/a_b/cd/ef')).toEqual(['a_b', 'cd', 'ef']);
  });

  it('ignores unrelated links and twitch pages that are not channels', () => {
    expect(parseChannelInput('https://example.com/foo twitch.tv/directory/all')).toEqual([]);
  });

  it('keeps Twitch as the default and separates direct Kick identities, even for the same name', () => {
    expect(parseChannelInput('xqc kick:XQC https://kick.com/xqc')).toEqual(['xqc', 'kick:xqc']);
    expect(parseChannelInput('@DJ-one twitch:Shroud https://twitch.tv/Lirik', 'kick')).toEqual([
      'kick:dj-one',
      'shroud',
      'lirik',
    ]);
    expect(normalizeChannel(' KICK:DJ-one ')).toBe('kick:dj-one');
    expect(normalizeLogin('kick:dj-one')).toBeNull();
  });

  it('accepts Kick player/chat links but rejects unrelated hosts, reserved pages and malformed ids', () => {
    expect(parseChannelInput('player.kick.com/DJ-one https://kick.com/popout/second/chat')).toEqual(
      ['kick:dj-one', 'kick:second'],
    );
    expect(
      parseChannelInput(
        'https://kick.com/categories/music https://kick.com.evil/name kick:bad! kick:',
      ),
    ).toEqual([]);
    expect(normalizeChannel(`kick:${'a'.repeat(26)}`)).toBeNull();
  });
});
