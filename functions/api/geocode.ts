const OHIO_GEOCODERS = [
  {
    name: 'Ohio Locator (authoritative)',
    endpoint: 'https://maps.ohio.gov/geocode/rest/services/Ohio_Locator/GeocodeServer/findAddressCandidates',
  },
  {
    name: 'Ohio OGRIP LBRS',
    endpoint: 'https://maps.ohio.gov/arcgis/rest/services/LBRSLocator2023/GeocodeServer/findAddressCandidates',
  },
]

const CENSUS_GEOCODER = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  })
}

type Candidate = {
  address?: string
  score?: number
  location?: { x?: number; y?: number }
  attributes?: Record<string, unknown>
}

type ResolverMatch = {
  address: string
  longitude: number
  latitude: number
  county: string | null
  score: number | null
  source: string
}

function extractCounty(attributes: Record<string, unknown>) {
  const raw = [
    attributes.Subregion,
    attributes.subregion,
    attributes.County,
    attributes.COUNTY,
    attributes.county,
  ].find((value) => typeof value === 'string')

  return typeof raw === 'string'
    ? raw.replace(/\s+County$/i, '').trim()
    : null
}

async function queryOhioLocator(endpoint: string, name: string, address: string): Promise<ResolverMatch | null> {
  const url = new URL(endpoint)
  url.searchParams.set('f', 'json')
  url.searchParams.set('SingleLine', address)
  url.searchParams.set('outFields', '*')
  url.searchParams.set('outSR', '4326')
  url.searchParams.set('maxLocations', '5')

  const response = await fetch(url)
  if (!response.ok) throw new Error(`${name} returned HTTP ${response.status}`)

  const data = await response.json() as { candidates?: Candidate[]; error?: { message?: string } }
  if (data.error) throw new Error(`${name}: ${data.error.message ?? 'ArcGIS error'}`)

  const candidate = data.candidates?.find((item) =>
    typeof item.location?.x === 'number' &&
    typeof item.location?.y === 'number' &&
    (item.score ?? 0) >= 60,
  )

  if (!candidate || typeof candidate.location?.x !== 'number' || typeof candidate.location?.y !== 'number') {
    return null
  }

  return {
    address: candidate.address ?? address,
    longitude: candidate.location.x,
    latitude: candidate.location.y,
    county: extractCounty(candidate.attributes ?? {}),
    score: candidate.score ?? null,
    source: name,
  }
}

async function queryCensus(address: string): Promise<ResolverMatch | null> {
  const url = new URL(CENSUS_GEOCODER)
  url.searchParams.set('address', address)
  url.searchParams.set('benchmark', 'Public_AR_Current')
  url.searchParams.set('vintage', 'Current_Current')
  url.searchParams.set('format', 'json')

  const response = await fetch(url)
  if (!response.ok) throw new Error(`U.S. Census geocoder returned HTTP ${response.status}`)

  const data = await response.json() as {
    result?: {
      addressMatches?: Array<{
        matchedAddress?: string
        coordinates?: { x?: number; y?: number }
        geographies?: {
          Counties?: Array<{ NAME?: string }>
        }
      }>
    }
  }

  const match = data.result?.addressMatches?.[0]
  const x = match?.coordinates?.x
  const y = match?.coordinates?.y
  if (typeof x !== 'number' || typeof y !== 'number') return null

  const countyName = match?.geographies?.Counties?.[0]?.NAME
  return {
    address: match?.matchedAddress ?? address,
    longitude: x,
    latitude: y,
    county: countyName ? countyName.replace(/\s+County$/i, '').trim() : null,
    score: null,
    source: 'U.S. Census Geocoder',
  }
}

export const onRequestGet = async ({ request }: { request: Request }) => {
  const requestUrl = new URL(request.url)
  const address = requestUrl.searchParams.get('address')?.trim()
  if (!address) return json({ error: 'Missing address' }, 400)

  const failures: string[] = []

  for (const locator of OHIO_GEOCODERS) {
    try {
      const match = await queryOhioLocator(locator.endpoint, locator.name, address)
      if (match) return json({ match })
      failures.push(`${locator.name}: no match`)
    } catch (error) {
      failures.push(error instanceof Error ? error.message : `${locator.name}: unknown error`)
    }
  }

  try {
    const match = await queryCensus(address)
    if (match) return json({ match })
    failures.push('U.S. Census Geocoder: no match')
  } catch (error) {
    failures.push(error instanceof Error ? error.message : 'U.S. Census Geocoder: unknown error')
  }

  return json({
    match: null,
    error: 'No property address match could be resolved',
    detail: failures.join(' | '),
  }, 200)
}
