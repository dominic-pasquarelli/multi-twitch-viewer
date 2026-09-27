/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TWITCH_CLIENT_ID?: string;
  readonly VITE_TWITCH_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
