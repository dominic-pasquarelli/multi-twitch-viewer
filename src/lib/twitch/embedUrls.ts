/** URL for Twitch's embeddable chat (dark theme). `parent` is this site's hostname. */
export const chatEmbedUrl = (login: string, parent: string): string =>
  `https://www.twitch.tv/embed/${encodeURIComponent(login)}/chat?darkpopout&parent=${encodeURIComponent(parent)}`;
