// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyPlayerChrome,
  applyPlayerTweaks,
  channelFromPlayerUrl,
  normalizePlayerChrome,
  isPlayerFrameUrl,
  playerChromeScript,
  playAllFrames,
  pressPlay,
  inspectPlayerError,
  scanPlayerErrors,
} from './playerChrome.mjs';

// A cut-down Twitch player: video, stream-info overlay on top, controls below.
const PLAYER = `
  <div class="player">
    <video></video>
    <div class="overlay">
      <div class="top" id="info">
        <a href="https://www.twitch.tv/tpain"><img alt="avatar"></a>
        <div><a href="https://www.twitch.tv/tpain">TPAIN</a><p>T-Paint back at The Network</p></div>
        <button data-a-target="follow-button">♡</button>
        <button data-a-target="subscribe-button">Subscribe</button>
        <button data-a-target="gift-subscribe-button">Gift</button>
      </div>
      <div data-a-target="player-controls" id="controls">
        <button data-a-target="player-play-pause-button">❚❚</button>
        <a href="https://www.twitch.tv/tpain">twitch</a>
      </div>
    </div>
  </div>`;

const hidden = () => [...document.querySelectorAll('[data-mtv-hidden]')].map((e) => e.id);
const tick = () => new Promise((r) => setTimeout(r, 80));

const INFO = { hideStreamInfo: true, skipContentWarning: false };
const OFF = { hideStreamInfo: false, skipContentWarning: false };
const applyStreamInfoHiding = (on) => applyPlayerTweaks(on ? INFO : OFF);

afterEach(() => {
  applyPlayerTweaks(OFF);
  delete window.__mtvGateStarted;
});

describe('hiding Twitch stream info', () => {
  it('hides the top info block and keeps the video and controls', () => {
    document.body.innerHTML = PLAYER;
    applyStreamInfoHiding(true);
    expect(hidden()).toEqual(['info']);
    expect(document.getElementById('mtv-stream-info-style')).not.toBeNull();
  });

  it('catches the overlay when Twitch renders it later', async () => {
    document.body.innerHTML = PLAYER;
    document.getElementById('info').remove();
    applyStreamInfoHiding(true);
    expect(hidden()).toEqual([]);
    document
      .querySelector('.overlay')
      .insertAdjacentHTML(
        'afterbegin',
        '<div id="late"><a href="https://www.twitch.tv/x">X</a></div>',
      );
    await tick();
    expect(hidden()).toEqual(['late']);
  });

  it('can be turned back off', () => {
    document.body.innerHTML = PLAYER;
    applyStreamInfoHiding(true);
    applyStreamInfoHiding(false);
    expect(hidden()).toEqual([]);
    expect(document.getElementById('mtv-stream-info-style')).toBeNull();
  });

  it('runs as a standalone script', () => {
    document.body.innerHTML = PLAYER;
    new Function(playerChromeScript(INFO))();
    expect(hidden()).toEqual(['info']);
  });
});

describe('skipping the content notice', () => {
  const GATE = `<div class="player"><video></video>
    <div id="gate"><p>Intended for certain audiences</p>
      <button data-a-target="content-classification-gate-overlay-start-watching-button">Start Watching</button>
    </div></div>`;
  const clicks = () => {
    const seen = [];
    document.addEventListener('click', (e) => seen.push(e.target.textContent.trim()), true);
    return seen;
  };

  it('clicks Start Watching once it appears', async () => {
    document.body.innerHTML = '<div class="player"><video></video></div>';
    const seen = clicks();
    applyPlayerTweaks({ hideStreamInfo: true, skipContentWarning: true });
    document.querySelector('.player').insertAdjacentHTML('beforeend', GATE);
    await tick();
    expect(seen).toEqual(['Start Watching']);
    await tick();
    expect(seen).toHaveLength(1); // only once per notice
  });

  it('finds the button by its text if Twitch renames its ids', () => {
    document.body.innerHTML =
      '<div><p>Intended for certain audiences</p><button> Start watching </button></div>';
    const seen = clicks();
    applyPlayerTweaks({ hideStreamInfo: false, skipContentWarning: true });
    expect(seen).toEqual(['Start watching']);
  });

  it('leaves the notice alone when turned off', () => {
    document.body.innerHTML = GATE;
    const seen = clicks();
    applyPlayerTweaks(INFO);
    expect(seen).toEqual([]);
  });

  it('only accepts known options, defaulting to on', () => {
    expect(normalizePlayerChrome(undefined)).toEqual({
      hideStreamInfo: true,
      skipContentWarning: true,
    });
    expect(normalizePlayerChrome({ hideStreamInfo: 0, skipContentWarning: 'yes', x: 1 })).toEqual({
      hideStreamInfo: false,
      skipContentWarning: true,
    });
  });
});

describe('the blurred "Intended for certain audiences" style', () => {
  const BLURRED = `<div class="player"><video></video>
    <button id="chip">Intended for certain audiences ⌄</button>
    <button data-a-target="player-overlay-play-button" id="big-play">▶</button>
    <div data-a-target="player-controls"><button data-a-target="player-play-pause-button">▶</button></div>
  </div>`;
  it('presses play once per load and hides the chip', async () => {
    document.body.innerHTML = BLURRED;
    const presses = [];
    document.getElementById('big-play').onclick = () => presses.push('big');
    new Function(playerChromeScript({ hideStreamInfo: false, skipContentWarning: true }))();
    expect(presses).toEqual(['big']);
    expect(hidden()).toEqual(['chip']);
    document.body.insertAdjacentHTML('beforeend', '<i></i>'); // Twitch re-renders
    await tick();
    expect(presses).toEqual(['big']); // pausing it yourself later sticks
  });

  it('leaves it alone when turned off', () => {
    document.body.innerHTML = BLURRED;
    const presses = [];
    document.getElementById('big-play').onclick = () => presses.push('big');
    applyPlayerTweaks({ hideStreamInfo: true, skipContentWarning: false });
    expect(presses).toEqual([]);
    expect(hidden()).not.toContain('chip');
  });
});

describe('pressing play (Play all)', () => {
  it('uses Twitch’s play button, and never pauses a playing stream', () => {
    document.body.innerHTML =
      '<video></video><div><button data-a-target="player-play-pause-button">▶</button></div>';
    let clicks = 0;
    document.querySelector('button').onclick = () => clicks++;
    expect(pressPlay()).toBe('clicked');
    expect(clicks).toBe(1);
    Object.defineProperty(document.querySelector('video'), 'paused', { value: false });
    expect(pressPlay()).toBe('playing');
    expect(clicks).toBe(1);
  });

  it('runs in player frames only, as a user gesture', () => {
    const calls = [];
    const frame = (url) => ({
      url,
      executeJavaScript: async (code, gesture) => void calls.push([url, gesture]),
    });
    playAllFrames([frame('https://player.twitch.tv/?channel=a'), frame('http://localhost:5757/')]);
    expect(calls).toEqual([['https://player.twitch.tv/?channel=a', true]]);
  });

  it('respects the currently playable channel allowlist', () => {
    const calls = [];
    const frame = (channel) => ({
      url: `https://player.twitch.tv/?channel=${channel}`,
      executeJavaScript: async () => void calls.push(channel),
    });
    playAllFrames([frame('shown'), frame('hidden')], ['shown']);
    expect(calls).toEqual(['shown']);
  });
});

describe('decode error detection', () => {
  it('detects the HTML video decode error and the Twitch error overlay', () => {
    document.body.innerHTML = '<video></video>';
    expect(inspectPlayerError()).toBeNull();
    Object.defineProperty(document.querySelector('video'), 'error', { value: { code: 3 } });
    expect(inspectPlayerError()).toBe(3000);
    document.body.innerHTML = '<div data-a-target="player-overlay-error">Error #3000</div>';
    expect(inspectPlayerError()).toBe(3000);
    document.body.innerHTML = '<div role="alert">Error #30000</div>';
    expect(inspectPlayerError()).toBeNull();
    document.body.innerHTML =
      '<p>Your browser encountered an error while decoding the video. (Error #3000)</p>';
    expect(inspectPlayerError()).toBe(3000);
  });

  it('reports only valid HTTPS Twitch frames, excluding frames that navigate during inspection', async () => {
    const calls = [];
    const errors = [];
    const frame = (url) => ({
      url,
      executeJavaScript: async () => {
        calls.push(url);
        return 3000;
      },
    });
    const navigated = frame('https://player.twitch.tv/?channel=moving');
    navigated.executeJavaScript = async () => {
      navigated.url = 'https://evil.example/';
      return 3000;
    };
    await scanPlayerErrors(
      [
        frame('https://player.twitch.tv/?channel=real'),
        frame('https://evil.example/?channel=bad'),
        frame('http://player.twitch.tv/?channel=insecure'),
        frame('https://player.twitch.tv/?channel=bad%22'),
        navigated,
      ],
      (error) => errors.push(error),
    );
    expect(calls).toEqual(['https://player.twitch.tv/?channel=real']);
    expect(errors).toEqual([{ channel: 'real', code: 3000 }]);
  });
});

describe('channelFromPlayerUrl', () => {
  it('reads the channel of a player frame only', () => {
    expect(channelFromPlayerUrl('https://player.twitch.tv/?channel=TPain&parent=localhost')).toBe(
      'tpain',
    );
    expect(channelFromPlayerUrl('https://player.twitch.tv/?video=123')).toBeNull();
    expect(channelFromPlayerUrl('https://evil.example/?channel=x')).toBeNull();
  });
});

describe('which frames are touched', () => {
  it('only Twitch player frames', async () => {
    expect(isPlayerFrameUrl('https://player.twitch.tv/?channel=x&parent=localhost')).toBe(true);
    expect(isPlayerFrameUrl('https://www.twitch.tv/embed/x/chat')).toBe(false);
    expect(isPlayerFrameUrl('nonsense')).toBe(false);
    const ran = [];
    const frame = (url) => ({ url, executeJavaScript: async (code) => void ran.push(code) });
    applyPlayerChrome(frame('https://player.twitch.tv/?channel=x'), { hideStreamInfo: true });
    applyPlayerChrome(frame('http://localhost:5757/'), { hideStreamInfo: true });
    applyPlayerChrome(null, { hideStreamInfo: true });
    expect(ran).toHaveLength(1);
  });
});
