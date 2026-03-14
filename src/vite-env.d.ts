/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_POCKETBASE_URL?: string;
  readonly VITE_AUTH_COLLECTION?: string;
  readonly VITE_ARTWORK_COLLECTION?: string;
  readonly VITE_ORDERS_COLLECTION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
