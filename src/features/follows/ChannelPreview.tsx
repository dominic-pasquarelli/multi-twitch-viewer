import { useState } from 'react';
import { formatCount, formatUptime, sizedThumbnail } from '@/lib/utils/format';
import { Avatar } from '@/ui/Avatar';
import type { PreviewPosition } from './useChannelPreview';
import styles from './Sidebar.module.css';

export function ChannelPreview({ preview }: { preview: PreviewPosition | null }) {
  return preview ? (
    <PreviewCard
      key={`${preview.row.login}-${preview.row.stream?.thumbnailUrl ?? ''}`}
      preview={preview}
    />
  ) : null;
}

function PreviewCard({ preview }: { preview: PreviewPosition }) {
  const [imageFailed, setImageFailed] = useState(false);
  const { row } = preview;
  const stream = row.stream;
  return (
    <div
      className={styles.preview}
      style={{ top: preview.top, left: preview.left }}
      data-testid="channel-preview"
      data-channel={row.login}
      role="tooltip"
    >
      {stream?.thumbnailUrl && !imageFailed ? (
        <img
          src={sizedThumbnail(stream.thumbnailUrl, 440, 248)}
          alt={`${row.displayName} live stream preview`}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className={styles.previewFallback}>
          <Avatar src={row.avatar} name={row.displayName} size={54} live={!!stream} />
          <span>
            {stream
              ? 'Live preview unavailable'
              : row.liveKnown === false
                ? 'Checking live status…'
                : 'Offline · no live preview'}
          </span>
        </div>
      )}
      <div className={styles.previewText}>
        <div>{row.displayName}</div>
        {stream ? (
          <>
            <div>{stream.title}</div>
            <div>
              {stream.gameName || 'No category'} · {formatCount(stream.viewerCount)} viewers · live{' '}
              {formatUptime(stream.startedAt)}
            </div>
          </>
        ) : (
          <div>
            {row.liveKnown === false ? 'Live status is loading.' : 'This channel is offline.'}
          </div>
        )}
      </div>
    </div>
  );
}
