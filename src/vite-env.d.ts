/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Google Cloud API key with the Street View Static API enabled. Optional —
  // comp cards fall back to a placeholder when it's unset. See .env.example.
  readonly VITE_GOOGLE_MAPS_API_KEY?: string
}
