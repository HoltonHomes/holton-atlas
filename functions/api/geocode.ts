const OHIO_GEOCODERS = [
  'https://maps.ohio.gov/geocode/rest/services/Ohio_Locator/GeocodeServer/findAddressCandidates',
  'https://maps.ohio.gov/arcgis/rest/services/LBRSLocator2023/GeocodeServer/findAddressCandidates',
]

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

async function queryLocator(endpoint: string, address: string): Promise<Candidate | null> {
  const url = new URL(endpoint)
  url.searchParams.set('f', 'json')
  url.searchParams.set('SingleLine', address)
  url.searchParams.set('outFields', '*')
  url.searchParams.set('outSR', '4326')
  url.searchParams.set('maxLocations', '5')

  const response = await fetch(url)
  if (!response.ok) return null

  const data = await response.json() as { candidates?: Candidate[]; error?: unknown }
  if (data.error) return null

  return data.candidates?.find((item) =>
    typeof item.location?.x === 'number' &&
    typeof item.location?.y === 'number' &&
    (item.score ?? 0) >= 65,
  ) ?? null
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

export const onRequestGet = async ({ request }: { request: Request }) => {
  const requestUrl = new URL(request.url)
  const address = requestUrl.searchParams.get('address')?.trim()
  if (!address) return json({ error: 'Missing address' }, 400)

  try {
    let candidate: Candidate | null = null
    let locatorName = 'Ohio Locator'

    for (const endpoint of OHIO_GEOCODERS) {
      candidate = await queryLocator(endpoint, address)
      if (candidate) {
        locatorName = endpoint.includes('/geocode/')
          ? 'Ohio Locator (authoritative)'
          : 'Ohio OGRIP LBRS'
        break
      }
    }

    if (!candidate || typeof candidate.location?.x !== 'number' || typeof candidate.location?.y !== 'number') {
      return json({ match: null, error: 'No confident Ohio address match found' }, 200)
    }

    const attributes = candidate.attributes ?? {}
    const county = extractCounty(attributes)

    return json({
      match: {
        address: candidate.address ?? address,
        longitude: candidate.location.x,
        latitude: candidate.location.y,
        county,
        score: candidate.score ?? null,
        source: locatorName,
      },
    })
  } catch (error) {
    return json({
      error: 'Unable to resolve address',
      detail: error instanceof Error ? error.message : 'Unknown resolver error',
    }, 502)
  }
}
