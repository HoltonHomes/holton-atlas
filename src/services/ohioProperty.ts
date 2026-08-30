type JsonObject = Record<string, any>

type ArcGisCandidate = {
  address?: string
  score?: number
  location?: { x?: number; y?: number }
  attributes?: Record<string, unknown>
}

export type LocatedProperty = {
  address: string
  latitude: number
  longitude: number
  county: string | null
  score: number | null
  source: string
}

export type ParcelFeature = {
  geometry: {
    type: 'Polygon' | 'MultiPolygon'
    coordinates: any
  }
  properties: Record<string, unknown>
}

export type ParcelResult = {
  supported: boolean
  county: string
  provider?: string
  parcel: ParcelFeature | null
  error?: string
}

const OHIO_LOCATORS = [
  {
    name: 'Ohio Locator (authoritative)',
    url: 'https://maps.ohio.gov/geocode/rest/services/Ohio_Locator/GeocodeServer/findAddressCandidates',
  },
  {
    name: 'Ohio OGRIP LBRS',
    url: 'https://maps.ohio.gov/arcgis/rest/services/LBRSLocator2023/GeocodeServer/findAddressCandidates',
  },
]

const OHIO_COUNTY_BOUNDARIES = [
  {
    name: 'Ohio Hosted County Boundaries',
    url: 'https://maps.ohio.gov/arcgis/rest/services/Hosted/County_Boundaries/FeatureServer/0/query',
  },
  {
    name: 'ODOT County Boundaries',
    url: 'https://tims.dot.state.oh.us/ags/rest/services/Boundaries/County/FeatureServer/0/query',
  },
]

const PARCEL_PROVIDERS: Record<string, { name: string; url: string; fields: string }> = {
  clermont: {
    name: 'Clermont County public GIS',
    url: 'https://maps.clermontcountyohio.gov/server/rest/services/WMAS/Parcels/MapServer/0/query',
    fields: 'PIN,PRCLID,ParcelNumber,ACRES,APRLAND,APRBLDG,APRTOT,ASDLAND,ASDBLDG,ASDTOT,PRICE,SALESDATE,SQ_FT,RMBED,FIXBATH,YRBLT,STYLE,DISTRICT,ZoneType,Floodway,HYPERLINK',
  },
  butler: {
    name: 'Butler County public GIS',
    url: 'https://services2.arcgis.com/FS7YxIXpWoaR2sAe/arcgis/rest/services/Parcels/FeatureServer/0/query',
    fields: '*',
  },
}

function jsonp<T>(baseUrl: string, params: Record<string, string>, timeoutMs = 12000): Promise<T> {
  return new Promise((resolve, reject) => {
    const callbackName = `__atlas_jsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const script = document.createElement('script')
    const url = new URL(baseUrl)

    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
    url.searchParams.set('f', 'json')
    url.searchParams.set('callback', callbackName)

    const cleanup = () => {
      clearTimeout(timer)
      script.remove()
      delete (window as any)[callbackName]
    }

    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('Public GIS request timed out'))
    }, timeoutMs)

    ;(window as any)[callbackName] = (data: T) => {
      cleanup()
      resolve(data)
    }

    script.onerror = () => {
      cleanup()
      reject(new Error('Public GIS request failed'))
    }

    script.src = url.toString()
    document.head.appendChild(script)
  })
}

function normalizeCounty(value: unknown) {
  return typeof value === 'string'
    ? value.replace(/\s+County$/i, '').trim()
    : null
}

function extractCounty(attributes: Record<string, unknown>) {
  const raw = [
    attributes.Subregion,
    attributes.subregion,
    attributes.County,
    attributes.COUNTY,
    attributes.county,
    attributes.NAME,
    attributes.Name,
    attributes.name,
    attributes.COUNTY_NAM,
    attributes.COUNTYNAME,
  ].find((value) => typeof value === 'string' && value.trim())

  return normalizeCounty(raw)
}

async function resolveOhioCounty(longitude: number, latitude: number): Promise<string | null> {
  for (const boundary of OHIO_COUNTY_BOUNDARIES) {
    try {
      const data = await jsonp<{
        features?: Array<{ attributes?: Record<string, unknown> }>
        error?: unknown
      }>(boundary.url, {
        geometry: `${longitude},${latitude}`,
        geometryType: 'esriGeometryPoint',
        inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects',
        outFields: '*',
        returnGeometry: 'false',
      })

      if (data.error) continue
      const county = extractCounty(data.features?.[0]?.attributes ?? {})
      if (county) return county
    } catch {
      // Try the next official statewide county boundary source.
    }
  }

  return null
}

export async function resolveOhioAddress(address: string): Promise<LocatedProperty | null> {
  for (const locator of OHIO_LOCATORS) {
    try {
      const data = await jsonp<{ candidates?: ArcGisCandidate[]; error?: unknown }>(locator.url, {
        SingleLine: address,
        outFields: '*',
        outSR: '4326',
        maxLocations: '5',
      })

      if (data.error) continue

      const candidate = data.candidates?.find((item) =>
        typeof item.location?.x === 'number' &&
        typeof item.location?.y === 'number' &&
        (item.score ?? 0) >= 60,
      )

      if (!candidate || typeof candidate.location?.x !== 'number' || typeof candidate.location?.y !== 'number') {
        continue
      }

      const longitude = candidate.location.x
      const latitude = candidate.location.y
      const county = extractCounty(candidate.attributes ?? {}) ?? await resolveOhioCounty(longitude, latitude)

      return {
        address: candidate.address ?? address,
        longitude,
        latitude,
        county,
        score: candidate.score ?? null,
        source: locator.name,
      }
    } catch {
      // Try the next statewide Ohio locator.
    }
  }

  return null
}

function ringsToGeoJson(rings: number[][][]): ParcelFeature['geometry'] {
  return {
    type: 'Polygon',
    coordinates: rings,
  }
}

export async function resolveCountyParcel(
  county: string,
  longitude: number,
  latitude: number,
): Promise<ParcelResult> {
  const key = county.trim().toLowerCase()
  const provider = PARCEL_PROVIDERS[key]

  if (!provider) {
    return { supported: false, county, parcel: null }
  }

  try {
    const data = await jsonp<{
      features?: Array<{
        attributes?: Record<string, unknown>
        geometry?: { rings?: number[][][] }
      }>
      error?: JsonObject
    }>(provider.url, {
      geometry: `${longitude},${latitude}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      outSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      returnGeometry: 'true',
      outFields: provider.fields,
    })

    if (data.error) {
      return { supported: true, county, provider: provider.name, parcel: null, error: 'County GIS returned an error' }
    }

    const feature = data.features?.[0]
    const rings = feature?.geometry?.rings

    if (!feature || !rings?.length) {
      return { supported: true, county, provider: provider.name, parcel: null }
    }

    return {
      supported: true,
      county,
      provider: provider.name,
      parcel: {
        geometry: ringsToGeoJson(rings),
        properties: feature.attributes ?? {},
      },
    }
  } catch (error) {
    return {
      supported: true,
      county,
      provider: provider.name,
      parcel: null,
      error: error instanceof Error ? error.message : 'County parcel lookup failed',
    }
  }
}
