const SERVICES: Record<string, { url: string; layers: string }> = {
  flood: { url: 'https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/export', layers: 'show:28' },
  wetlands: { url: 'https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/export', layers: 'show:0' },
}

export const onRequestGet = async ({ request }: { request: Request }) => {
  const incoming = new URL(request.url)
  const service = SERVICES[incoming.searchParams.get('layer') ?? '']
  const bbox = incoming.searchParams.get('bbox')
  if (!service || !bbox || !/^-?[\d.]+,-?[\d.]+,-?[\d.]+,-?[\d.]+$/.test(bbox)) return new Response('Invalid map tile request', { status: 400 })

  const upstream = new URL(service.url)
  Object.entries({ f: 'image', format: 'png32', transparent: 'true', dpi: '96', layers: service.layers, bbox, bboxSR: '3857', imageSR: '3857', size: '256,256' })
    .forEach(([key, value]) => upstream.searchParams.set(key, value))
  const response = await fetch(upstream, { headers: { 'user-agent': 'ATLAS by Holton Homes' } })
  if (!response.ok) return new Response('Map source unavailable', { status: 502 })
  return new Response(response.body, { headers: { 'content-type': response.headers.get('content-type') ?? 'image/png', 'cache-control': 'public, max-age=86400', 'access-control-allow-origin': '*' } })
}
