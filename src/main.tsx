import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { setWorkerUrl } from 'maplibre-gl'
import App from './App'
import { queryClient } from './lib/queryClient'
import './design/tokens.css'
import './styles.css'
import './parcel.css'
import './report-polish.css'
import './intelligence.css'
import './research-evidence.css'
import './homeowner.css'
import './owner-overrides.css'
import './phase-two.css'
import './components/charts/charts.css'
import './tax-safety.css'
import './client-room.css'
import './components/client-decision-guide.css'
import './client-flow.css'
import './value-story.css'
import './land-at-glance.css'

// maplibre-gl ships its tile/style worker as a separate prebuilt file
// (maplibre-gl-worker.mjs, plus a sibling maplibre-gl-shared.mjs it imports)
// and resolves that URL at runtime relative to wherever the main bundle
// happens to load from. Vite's default build never copies those files into
// the output, so the worker request 404s (falls back to index.html on this
// SPA host), the map's off-main-thread style/tile processing silently
// fails, and the renderer eventually crashes with "Cannot read properties
// of undefined (reading 'shaderPreludeCode')" — the actual cause of the
// map going blank.
//
// Pointing setWorkerUrl() straight at a CDN copy does NOT work: browsers
// silently refuse to construct a module Worker from a cross-origin script
// URL (no error, no network request — the worker just never starts).
// Instead, fetch the worker script's source as text (a plain cross-origin
// fetch, unlike Worker construction, is allowed once unpkg's CORS headers
// permit it), rewrite its one relative sibling import to an absolute CDN
// URL so it still resolves once the script's origin changes, and hand the
// result to setWorkerUrl() as a same-origin blob: URL. A same-origin blob
// URL is not subject to the cross-origin Worker restriction, and its own
// absolute import of maplibre-gl-shared.mjs is a normal cross-origin
// module fetch, which browsers do allow.
//
// Pin MAPLIBRE_VERSION to the installed maplibre-gl version (package.json)
// whenever it's upgraded.
const MAPLIBRE_VERSION = '6.6.0'
const WORKER_CDN_URL = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl-worker.mjs`
const SHARED_CDN_URL = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl-shared.mjs`

async function configureMapWorker(): Promise<void> {
  try {
    const response = await fetch(WORKER_CDN_URL)
    if (!response.ok) throw new Error(`Worker fetch failed: ${response.status}`)
    const source = await response.text()
    if (!source.includes('"./maplibre-gl-shared.mjs"')) {
      throw new Error('Unexpected worker source: sibling import not found')
    }
    const rewritten = source.replace('"./maplibre-gl-shared.mjs"', JSON.stringify(SHARED_CDN_URL))
    const blobUrl = URL.createObjectURL(new Blob([rewritten], { type: 'text/javascript' }))
    setWorkerUrl(blobUrl)
  } catch (error) {
    // If the CDN fetch/rewrite fails for any reason, fall back to pointing
    // straight at the CDN. This keeps the rest of the app working the way
    // it did before (map won't render), rather than throwing during boot.
    console.error('[ATLAS] Failed to prepare a same-origin maplibre-gl worker; map rendering will be degraded.', error)
    setWorkerUrl(WORKER_CDN_URL)
  }
}

configureMapWorker().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  )
})
