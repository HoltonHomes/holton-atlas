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
// map going blank. Point maplibre-gl at the matching version on a CDN
// instead of trying to bundle these ourselves; its sibling import resolves
// against the same CDN URL automatically. Pin this to the installed
// maplibre-gl version (package.json) whenever it's upgraded.
setWorkerUrl('https://unpkg.com/maplibre-gl@6.6.0/dist/maplibre-gl-worker.mjs')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
