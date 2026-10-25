import { useState } from 'react';
import { Link2, X } from 'lucide-react';
import { useServices } from '@/app/servicesContext';
import { normalizeLogin } from '@/lib/channels/parseChannels';
import { parseKickSlug } from '@/lib/kick/links';
import { useChannelPrefs } from '@/state/channelPrefsStore';
import { useUi } from '@/state/uiStore';
import { Button, IconButton } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import formStyles from '@/ui/Form.module.css';
import { useKickChannels, useLiveStatus } from '../follows/queries';
import styles from './Kick.module.css';

/**
 * Link a Twitch channel to the same streamer's Kick channel: while they're
 * offline on Twitch but live on Kick, their stream plays from Kick, and it
 * switches back once they go live on Twitch.
 */
export function KickLinksDialog() {
  const open = useUi((s) => s.dialog === 'kick');
  const close = () => useUi.getState().openDialog(null);
  return (
    <Dialog open={open} title="Linked Kick channels" onClose={close} width={520}>
      {open && <KickLinksEditor onDone={close} />}
    </Dialog>
  );
}

function KickLinksEditor({ onDone }: { onDone(): void }) {
  const { kickApi } = useServices();
  const prefill = useUi((s) => s.kickLinkFor);
  const links = useChannelPrefs((s) => s.kickLinks);
  const { linkKick, unlinkKick } = useChannelPrefs.getState();
  const kick = useKickChannels();
  const logins = Object.keys(links);
  const live = useLiveStatus(logins).live;
  const kickBySlug = new Map((kick.data ?? []).map((c) => [c.slug, c]));
  const [twitch, setTwitch] = useState(prefill ?? '');
  const [kickName, setKickName] = useState(prefill ? (links[prefill] ?? prefill) : '');
  const twitchLogin = normalizeLogin(twitch);
  const kickSlug = parseKickSlug(kickName);

  return (
    <div className={styles.editor}>
      <p>
        To watch a Kick channel directly, select Kick in the Add channels box, enter a username, or
        paste a kick.com link. No Twitch link is needed.
      </p>
      <p>
        For streamers on both platforms: while a linked channel is offline on Twitch but live on
        Kick, it plays from Kick (in the view, the sidebar and Favorites), then switches back when
        they go live on Twitch.
      </p>
      {!kickApi && (
        <div className={styles.warning} data-testid="kick-setup-needed">
          Checking Kick needs your Kick app’s Client ID and Secret.{' '}
          <Button size="small" onClick={() => useUi.getState().openDialog('settings')}>
            Set up in Settings → Account
          </Button>
        </div>
      )}
      {kick.error && (
        <div className={`${styles.warning} ${styles.error}`} role="alert">
          {kick.error.message}
        </div>
      )}
      <form
        className={styles.add}
        onSubmit={(e) => {
          e.preventDefault();
          if (!twitchLogin || !kickSlug) return;
          linkKick(twitchLogin, kickSlug);
          setTwitch('');
          setKickName('');
        }}
      >
        <input
          className={formStyles.input}
          aria-label="Twitch channel"
          placeholder="Twitch channel"
          value={twitch}
          onChange={(e) => {
            // Most streamers use the same name on both: suggest it.
            if (kickName === twitch) setKickName(e.target.value);
            setTwitch(e.target.value);
          }}
          data-testid="kick-link-twitch"
        />
        <span className={styles.arrow}>→</span>
        <input
          className={formStyles.input}
          aria-label="Kick channel"
          placeholder="Kick channel or link"
          value={kickName}
          onChange={(e) => setKickName(e.target.value)}
          data-testid="kick-link-kick"
        />
        <Button type="submit" disabled={!twitchLogin || !kickSlug}>
          <Link2 size={14} /> Link
        </Button>
      </form>
      {logins.length === 0 ? (
        <p>No linked channels yet.</p>
      ) : (
        <ul className={styles.list} data-testid="kick-links">
          {logins.map((login) => {
            const slug = links[login]!;
            const stream = live.get(login);
            const onKick = kickBySlug.get(slug);
            const status =
              stream && stream.platform !== 'kick'
                ? 'Live on Twitch'
                : onKick?.isLive
                  ? `Live on Kick${onKick.categoryName ? ` · ${onKick.categoryName}` : ''}`
                  : kick.isSuccess
                    ? 'Offline'
                    : '';
            return (
              <li key={login} data-testid="kick-link" data-channel={login}>
                <span className={styles.name}>
                  {login} → kick.com/{slug}
                </span>
                <span
                  className={`${styles.status} ${status.startsWith('Live') ? styles.live : ''}`}
                >
                  {status}
                </span>
                <IconButton
                  size="sm"
                  label={`Unlink ${login} from Kick`}
                  icon={<X size={15} />}
                  onClick={() => unlinkKick(login)}
                />
              </li>
            );
          })}
        </ul>
      )}
      <div className={formStyles.row} style={{ justifyContent: 'flex-end' }}>
        <Button onClick={onDone}>Close</Button>
      </div>
    </div>
  );
}
