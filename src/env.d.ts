/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Cesium Ion access token for the 3D globe (optional — globe works without it). */
  readonly PUBLIC_CESIUM_ION_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
