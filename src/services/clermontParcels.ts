export type ClermontParcel = {
  geometry: GeoJSON.Geometry
  properties: {
    PIN?: string | null
    PRCLID?: string | null
    ParcelNumber?: string | null
    ACRES?: number | null
    APRLAND?: number | null
    APRBLDG?: number | null
    APRTOT?: number | null
    ASDLAND?: number | null
    ASDBLDG?: number | null
    ASDTOT?: number | null
    PRICE?: number | null
    SALESDATE?: number | null
    SQ_FT?: number | null
    RMBED?: number | null
    FIXBATH?: number | null
    YRBLT?: number | null
    STYLE?: string | null
    DISTRICT?: string | null
    ZoneType?: string | null
    Floodway?: string | null
    HYPERLINK?: string | null
  }
}

const PARCEL_QUERY_URL = 'https://maps.clermontcountyohio.gov/server/rest/services/WMAS/Parcels/MapServer/0/query'

export async function findClermontParcel(longitude: number, latitude: number): Promise<ClermontParcel | null> {
  const url = new URL(PARCEL_QUERY_URL)
  url.searchParams.set('f', 'geojson')
  url.searchParams.set('geometry', `${longitude},${latitude}`)
  url.searchParams.set('geometryType', 'esriGeometryPoint')
  url.searchParams.set('inSR', '4326')
  url.searchParams.set('outSR', '4326')
  url.searchParams.set('spatialRel', 'esriSpatialRelIntersects')
  url.searchParams.set('returnGeometry', 'true')
  url.searchParams.set('outFields', 'PIN,PRCLID,ParcelNumber,ACRES,APRLAND,APRBLDG,APRTOT,ASDLAND,ASDBLDG,ASDTOT,PRICE,SALESDATE,SQ_FT,RMBED,FIXBATH,YRBLT,STYLE,DISTRICT,ZoneType,Floodway,HYPERLINK')

  const response = await fetch(url)
  if (!response.ok) throw new Error('Clermont County parcel service unavailable')

  const data = await response.json() as {
    features?: ClermontParcel[]
  }

  return data.features?.[0] ?? null
}
