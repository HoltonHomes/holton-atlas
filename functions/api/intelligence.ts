const SOURCES: Record<string, string> = {
  wetlands: 'https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0/query',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=86400' } })
}

export const onRequestGet = async ({ request }: { request: Request }) => {
  const incoming = new URL(request.url)
  const source = SOURCES[incoming.searchParams.get('layer') ?? '']
  const longitude = Number(incoming.searchParams.get('longitude'))
  const latitude = Number(incoming.searchParams.get('latitude'))
  if (!source || !Number.isFinite(longitude) || !Number.isFinite(latitude)) return json({ error: 'Invalid intelligence request' }, 400)

  const upstream = new URL(source)
  Object.entries({ f: 'json', geometry: `${longitude},${latitude}`, geometryType: 'esriGeometryPoint', inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects', returnGeometry: 'false', outFields: '*' })
    .forEach(([key, value]) => upstream.searchParams.set(key, value))
  let response = await fetch(upstream, { headers: { 'user-agent': 'ATLAS by Holton Homes' } })
  if (!response.ok) response = await fetch(upstream, { headers: { 'user-agent': 'ATLAS by Holton Homes' } })
  if (!response.ok) return json({ error: 'Intelligence source unavailable' }, 502)
  return new Response(response.body, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=86400' } })
}
