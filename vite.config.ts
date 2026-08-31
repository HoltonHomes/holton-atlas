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
      server.middlewares.use(async (request, response, next) => {
        const incoming = new URL((request as any).url ?? '', 'http://localhost')
        if (incoming.pathname !== '/api/intelligence' || incoming.searchParams.get('layer') !== 'wetlands') return next()
        try {
          const longitude = incoming.searchParams.get('longitude')
          const latitude = incoming.searchParams.get('latitude')
          const upstream = new URL('https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0/query')
          Object.entries({ f: 'json', geometry: `${longitude},${latitude}`, geometryType: 'esriGeometryPoint', inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects', returnGeometry: 'false', outFields: '*' }).forEach(([key, value]) => upstream.searchParams.set(key, value))
          let result = await fetch(upstream)
          if (!result.ok) result = await fetch(upstream)
          response.statusCode = result.status
          response.setHeader('content-type', 'application/json; charset=utf-8')
          response.end(new Uint8Array(await result.arrayBuffer()))
        } catch {
          response.statusCode = 502
          response.setHeader('content-type', 'application/json; charset=utf-8')
          response.end(JSON.stringify({ error: 'Wetlands source unavailable' }))
        }
      })
    },
  }],
})
