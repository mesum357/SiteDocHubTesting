/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional full OSC base when the app is served over http:// on camera Wi‑Fi (e.g. http://192.168.42.1). */
  readonly VITE_CAMERA_OSC_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
