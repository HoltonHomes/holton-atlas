import area from '@turf/area'
import intersect from '@turf/intersect'
import { feature, featureCollection } from '@turf/helpers'
import type { Feature, Geometry, MultiPolygon, Polygon } from 'geojson'

const SQ_METERS_PER_ACRE = 4046.8564224

type ParcelGeometry = Polygon | MultiPolygon

type LayerConfig = {
  url: string
  outFields: string
  source: string
}

const LAYERS = {
  flood: {
    url: 'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Flood_Hazard_Reduced_Set_gdb/FeatureServer/0/query',
    outFields: 'FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE',
    source: 'FEMA NFHL via Esri',
  },
  wetlands: {
    url: 'https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0/query',
    outFields: 'WETLAND_TYPE,WETLAND_TY,ATTRIBUTE',
    source: 'USFWS National Wetlands Inventory',
  },
  soils: {
    url: 'https://apps.geo.fpac.usda.gov/nrcs-geodata/rest/services/soils/cg_soils/MapServer/0/query',
    outFields: 'muname,musym,farmlndcl,nirrcapcl,areasymbol',
    source: 'USDA NRCS SSURGO',
  },
} satisfies Record<string, LayerConfig>

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=86400',
    },
  })
}

function isParcelGeometry(value: Geometry | null | undefined): value is ParcelGeometry {
  return value?.type === 'Polygon' || value?.type === 'MultiPolygon'
}

function toEsriRings(geometry: ParcelGeometry): number[][][] {
  return geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat()
}

function getValue(properties: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const direct = properties[key]
    if (direct !== undefined && direct !== null && direct !== '') return direct
    const found = Object.keys(properties).find((candidate) => candidate.toLowerCase() === key.toLowerCase())
    if (found) {
      const value = properties[found]
      if (value !== undefined && value !== null && value !== '') return value
    }
  }
  return null
}

function asText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : value != null ? String(value) : null
}

function normalizeFeatures(payload: any): Array<Feature<Polygon | MultiPolygon, Record<string, unknown>>> {
  if (!Array.isArray(payload?.features)) return []

  return payload.features.flatMap((row: any) => {
    const properties = (row?.properties ?? row?.attributes ?? {}) as Record<string, unknown>
    const geometry = row?.geometry
    if (geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon') {
      return [feature(geometry, properties)]
    }
    if (Array.isArray(geometry?.rings)) {
      return [feature({ type: 'Polygon', coordinates: geometry.rings } as Polygon, properties)]
    }
    return []
  })
}

async function queryLayer(config: LayerConfig, parcel: ParcelGeometry) {
  const geometry = JSON.stringify({ rings: toEsriRings(parcel), spatialReference: { wkid: 4326 } })
  const baseParams = {
    geometry,
    geometryType: 'esriGeometryPolygon',
    inSR: '4326',
    outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    returnGeometry: 'true',
    outFields: config.outFields,
  }

  for (const format of ['geojson', 'json']) {
    const body = new URLSearchParams({ ...baseParams, f: format })
    try {
      const response = await fetch(config.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'user-agent': 'ATLAS by Holton Homes',
        },
        body,
      })
      if (!response.ok) continue
      const payload = await response.json<any>()
      if (payload?.error) continue
      return normalizeFeatures(payload)
    } catch {
      // Try the alternate ArcGIS response format before giving up.
    }
  }

  throw new Error(`${config.source} unavailable`)
}

function clippedAcres(parcelFeature: Feature<ParcelGeometry>, overlay: Feature<Polygon | MultiPolygon>) {
  try {
    const clipped = intersect(featureCollection([parcelFeature, overlay]))
    return clipped ? area(clipped) / SQ_METERS_PER_ACRE : 0
  } catch {
    return 0
  }
}

function percent(acres: number, totalAcres: number) {
  if (!totalAcres) return 0
  return Math.min(100, Math.max(0, acres / totalAcres * 100))
}

function rounded(value: number, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function summarizeFlood(parcelFeature: Feature<ParcelGeometry>, totalAcres: number, features: Array<Feature<Polygon | MultiPolygon, Record<string, unknown>>>) {
  let mappedAcres = 0
  let sfhaAcres = 0
  const zones = new Set<string>()

  for (const row of features) {
    const acres = clippedAcres(parcelFeature, row)
    if (acres <= 0) continue
    mappedAcres += acres
    const zone = asText(getValue(row.properties, 'FLD_ZONE'))
    const subtype = asText(getValue(row.properties, 'ZONE_SUBTY'))
    if (zone) zones.add(subtype ? `${zone} · ${subtype}` : zone)
    const sfha = asText(getValue(row.properties, 'SFHA_TF'))?.toUpperCase()
    if (sfha === 'T' || sfha === 'TRUE' || sfha === 'Y' || sfha === 'YES') sfhaAcres += acres
  }

  mappedAcres = Math.min(totalAcres, mappedAcres)
  sfhaAcres = Math.min(totalAcres, sfhaAcres)
  return {
    source: LAYERS.flood.source,
    intersectingFeatures: features.length,
    mappedAcres: rounded(mappedAcres),
    mappedPercent: rounded(percent(mappedAcres, totalAcres), 1),
    sfhaAcres: rounded(sfhaAcres),
    sfhaPercent: rounded(percent(sfhaAcres, totalAcres), 1),
    zones: [...zones].slice(0, 8),
  }
}

function summarizeWetlands(parcelFeature: Feature<ParcelGeometry>, totalAcres: number, features: Array<Feature<Polygon | MultiPolygon, Record<string, unknown>>>) {
  let mappedAcres = 0
  const types = new Set<string>()

  for (const row of features) {
    const acres = clippedAcres(parcelFeature, row)
    if (acres <= 0) continue
    mappedAcres += acres
    const type = asText(getValue(row.properties, 'WETLAND_TYPE', 'WETLAND_TY', 'ATTRIBUTE'))
    if (type) types.add(type)
  }

  mappedAcres = Math.min(totalAcres, mappedAcres)
  return {
    source: LAYERS.wetlands.source,
    intersectingFeatures: features.length,
    mappedAcres: rounded(mappedAcres),
    mappedPercent: rounded(percent(mappedAcres, totalAcres), 1),
    types: [...types].slice(0, 8),
  }
}

function summarizeSoils(parcelFeature: Feature<ParcelGeometry>, totalAcres: number, features: Array<Feature<Polygon | MultiPolygon, Record<string, unknown>>>) {
  const units = new Map<string, { name: string; symbol: string | null; farmland: string | null; capability: string | null; acres: number }>()

  for (const row of features) {
    const acres = clippedAcres(parcelFeature, row)
    if (acres <= 0) continue
    const name = asText(getValue(row.properties, 'muname', 'MUNAME')) ?? 'Mapped soil unit'
    const symbol = asText(getValue(row.properties, 'musym', 'MUSYM'))
    const farmland = asText(getValue(row.properties, 'farmlndcl', 'FARMLNDCL'))
    const capability = asText(getValue(row.properties, 'nirrcapcl', 'NIRRCAPCL'))
    const key = `${symbol ?? ''}|${name}`
    const existing = units.get(key)
    units.set(key, {
      name,
      symbol,
      farmland,
      capability,
      acres: (existing?.acres ?? 0) + acres,
    })
  }

  const rows = [...units.values()]
    .map((unit) => ({ ...unit, acres: rounded(unit.acres), percent: rounded(percent(unit.acres, totalAcres), 1) }))
    .sort((a, b) => b.acres - a.acres)

  const coveredAcres = Math.min(totalAcres, rows.reduce((sum, row) => sum + row.acres, 0))
  return {
    source: LAYERS.soils.source,
    intersectingFeatures: features.length,
    coveredAcres: rounded(coveredAcres),
    coveredPercent: rounded(percent(coveredAcres, totalAcres), 1),
    dominantUnit: rows[0] ?? null,
    units: rows.slice(0, 12),
  }
}

export const onRequestPost = async ({ request }: { request: Request }) => {
  let body: { geometry?: Geometry }
  try {
    body = await request.json<{ geometry?: Geometry }>()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  if (!isParcelGeometry(body.geometry)) return json({ error: 'A Polygon or MultiPolygon parcel geometry is required' }, 400)

  const parcelFeature = feature(body.geometry)
  const totalAcres = area(parcelFeature) / SQ_METERS_PER_ACRE
  if (!Number.isFinite(totalAcres) || totalAcres <= 0) return json({ error: 'Parcel geometry has no measurable area' }, 400)

  const results = await Promise.allSettled([
    queryLayer(LAYERS.flood, body.geometry),
    queryLayer(LAYERS.wetlands, body.geometry),
    queryLayer(LAYERS.soils, body.geometry),
  ])

  const flood = results[0].status === 'fulfilled' ? summarizeFlood(parcelFeature, totalAcres, results[0].value) : null
  const wetlands = results[1].status === 'fulfilled' ? summarizeWetlands(parcelFeature, totalAcres, results[1].value) : null
  const soils = results[2].status === 'fulfilled' ? summarizeSoils(parcelFeature, totalAcres, results[2].value) : null

  return json({
    checkedAt: new Date().toISOString(),
    parcelAcres: rounded(totalAcres),
    analysisLevel: 'parcel-intersection',
    flood,
    wetlands,
    soils,
    unavailable: [
      results[0].status === 'rejected' ? LAYERS.flood.source : null,
      results[1].status === 'rejected' ? LAYERS.wetlands.source : null,
      results[2].status === 'rejected' ? LAYERS.soils.source : null,
    ].filter(Boolean),
    limitation: 'Mapped datasets are screening evidence. Parcel boundaries are GIS representations, not surveys; environmental mapping does not replace field or jurisdictional determinations.',
  })
}
