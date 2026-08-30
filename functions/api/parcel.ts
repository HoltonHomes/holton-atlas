type Provider = {
  name: string
  queryUrl: string
}

const providers: Record<string, Provider> = {
  clermont: {
    name: 'Clermont County GIS',
    queryUrl: 'https://maps.clermontcountyohio.gov/server/rest/services/WMAS/Parcels/MapServer/0/query',
  },
  butler: {
    name: 'Butler County GIS',
    queryUrl: 'https://services2.arcgis.com/FS7YxIXpWoaR2sAe/arcgis/rest/services/Parcels/FeatureServer/0/query',
  },
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  })
}

function normalizeCounty(value: string) {
  return value.toLowerCase().replace(/\s+county$/i, '').trim()
}

export const onRequestGet = async ({ request }: { request: Request }) => {
  const url = new URL(request.url)
  const county = url.searchParams.get('county')?.trim()
  const longitude = Number(url.searchParams.get('longitude'))
  const latitude = Number(url.searchParams.get('latitude'))

  if (!county || !Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return json({ error: 'Missing county or coordinates' }, 400)
  }

  const provider = providers[normalizeCounty(county)]
  if (!provider) {
    return json({ supported: false, county, parcel: null })
  }

  try {
    const query = new URL(provider.queryUrl)
    query.searchParams.set('f', 'geojson')
    query.searchParams.set('geometry', `${longitude},${latitude}`)
    query.searchParams.set('geometryType', 'esriGeometryPoint')
    query.searchParams.set('inSR', '4326')
    query.searchParams.set('outSR', '4326')
    query.searchParams.set('spatialRel', 'esriSpatialRelIntersects')
    query.searchParams.set('returnGeometry', 'true')
    query.searchParams.set('outFields', '*')

    const response = await fetch(query, {
      headers: { 'user-agent': 'ATLAS by Holton Homes' },
    })

    if (!response.ok) {
      return json({ supported: true, county, provider: provider.name, parcel: null, error: 'Parcel service unavailable' }, 502)
    }

    const data = await response.json() as {
      features?: Array<{ geometry?: unknown; properties?: Record<string, unknown> }>
    }

    const feature = data.features?.[0]
    if (!feature?.geometry) {
      return json({ supported: true, county, provider: provider.name, parcel: null })
    }

    return json({
      supported: true,
      county,
      provider: provider.name,
      parcel: {
        geometry: feature.geometry,
        properties: feature.properties ?? {},
      },
    })
  } catch {
    return json({ supported: true, county, provider: provider.name, parcel: null, error: 'Parcel lookup failed' }, 502)
  }
}
