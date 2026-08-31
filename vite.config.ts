import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const mapServices: Record<string, { url: string; layers: string }> = {
  flood: { url: 'https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/export', layers: 'show:28' },
  wetlands: { url: 'https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/export', layers: 'show:0' },
}

export default defineConfig({
  optimizeDeps: { exclude: ['maplibre-gl'] },
  plugins: [react(), {
    name: 'atlas-local-map-proxy',
    configureServer(server) {
      server.middlewares.use('/api/map-tile', async (request, response, next) => {
        try {
          const incoming = new URL((request as any).url ?? '', 'http://localhost')
          const service = mapServices[incoming.searchParams.get('layer') ?? '']
          const bbox = incoming.searchParams.get('bbox')
          if (!service || !bbox) return next()
          const upstream = new URL(service.url)
          Object.entries({ f: 'image', format: 'png32', transparent: 'true', dpi: '96', layers: service.layers, bbox, bboxSR: '3857', imageSR: '3857', size: '256,256' }).forEach(([key, value]) => upstream.searchParams.set(key, value))
          const result = await fetch(upstream)
          response.statusCode = result.status
          response.setHeader('content-type', result.headers.get('content-type') ?? 'image/png')
          response.end(new Uint8Array(await result.arrayBuffer()))
        } catch { next() }
      })
    },
  }],
})
