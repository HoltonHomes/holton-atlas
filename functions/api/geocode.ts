const OHIO_GEOCODER = 'https://maps.ohio.gov/arcgis/rest/services/LBRSLocator2023/GeocodeServer/findAddressCandidates'
const COUNTY_LAYER = 'https://maps.ohio.gov/arcgis/rest/services/Hosted/County_Boundaries/FeatureServer/0/query'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  })
}

async function lookupCounty(longitude: number, latitude: number) {
  const url = new URL(COUNTY_LAYER)
  url.searchParams.set('f', 'json')
  url.searchParams.set('geometry', `${longitude},${latitude}`)
  url.searchParams.set('geometryType', 'esriGeometryPoint')
  url.searchParams.set('inSR', '4326')
  url.searchParams.set('spatialRel', 'esriSpatialRelIntersects')
  url.searchParams.set('outFields', '*')
  url.searchParams.set('returnGeometry', 'false')

  const response = await fetch(url)
  if (!response.ok) return null
  const data = await response.json() as { features?: Array<{ attributes?: Record<string, unknown> }> }
  const attrs = data.features?.[0]?.attributes ?? {}
  const raw = attrs.NAME ?? attrs.Name ?? attrs.name ?? attrs.COUNTY ?? attrs.County
  return typeof raw === 'string' ? raw.replace(/\s+County$/i, '').trim() : null
}

export const onRequestGet = async ({ request }: { request: Request }) => {
  const requestUrl = new URL(request.url)
  const address = requestUrl.searchParams.get('address')?.trim()
  if (!address) return json({ error: 'Missing address' }, 400)

  try {
    const url = new URL(OHIO_GEOCODER)
    url.searchParams.set('f', 'json')
    url.searchParams.set('SingleLine', address)
    url.searchParams.set('outFields', '*')
    url.searchParams.set('outSR', '4326')
    url.searchParams.set('maxLocations', '5')

    const response = await fetch(url, {
      headers: { 'user-agent': 'ATLAS by Holton Homes' },
    })
    if (!response.ok) return json({ error: 'Ohio address service unavailable' }, 502)

    const data = await response.json() as {
      candidates?: Array<{
        address?: string
        score?: number
        location?: { x?: number; y?: number }
        attributes?: Record<string, unknown>
      }>
    }

    const candidate = data.candidates?.find((item) =>
      typeof item.location?.x === 'number' &&
      typeof item.location?.y === 'number' &&
      (item.score ?? 0) >= 70,
    )

    if (!candidate || typeof candidate.location?.x !== 'number' || typeof candidate.location?.y !== 'number') {
      return json({ match: null })
    }

    const attributes = candidate.attributes ?? {}
    let county = [attributes.Subregion, attributes.County, attributes.COUNTY, attributes.county]
      .find((value) => typeof value === 'string') as string | undefined

    county = county?.replace(/\s+County$/i, '').trim()
    if (!county) county = await lookupCounty(candidate.location.x, candidate.location.y) ?? undefined

    return json({
      match: {
        address: candidate.address ?? address,
        longitude: candidate.location.x,
        latitude: candidate.location.y,
        county: county ?? null,
        score: candidate.score ?? null,
        source: 'Ohio OGRIP LBRS',
      },
    })
  } catch {
    return json({ error: 'Unable to resolve address' }, 502)
  }
}
