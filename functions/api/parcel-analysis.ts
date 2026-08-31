type ParcelGeometry = {
  type: 'Polygon' | 'MultiPolygon'
  coordinates: any
}

type LayerConfig = {
  url: string
  outFields: string
  source: string
}

type NormalizedFeature = {
  type: 'Feature'
  properties: Record<string, unknown>
  geometry: ParcelGeometry
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

function isParcelGeometry(value: unknown): value is ParcelGeometry {
  if (!value || typeof value !== 'object') return false
  const geometry = value as { type?: unknown; coordinates?: unknown }
  return (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') && Array.isArray(geometry.coordinates)
}

function toEsriRings(geometry: ParcelGeometry): number[][][] {
  return geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat()
}

function normalizeFeatures(payload: any): NormalizedFeature[] {
  if (!Array.isArray(payload?.features)) return []

  return payload.features.flatMap((row: any) => {
    const properties = (row?.properties ?? row?.attributes ?? {}) as Record<string, unknown>
    const geometry = row?.geometry

    if (geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon') {
      return [{ type: 'Feature' as const, properties, geometry: { type: geometry.type, coordinates: geometry.coordinates } as ParcelGeometry }]
    }

    if (Array.isArray(geometry?.rings)) {
      return [{ type: 'Feature' as const, properties, geometry: { type: 'Polygon' as const, coordinates: geometry.rings } }]
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
    resultRecordCount: '500',
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
      const payload: any = await response.json()
      if (payload?.error) continue
      return normalizeFeatures(payload)
    } catch {
      // Try the alternate ArcGIS response format before giving up.
    }
  }

  throw new Error(`${config.source} unavailable`)
}

export const onRequestPost = async ({ request }: { request: Request }) => {
  let body: { geometry?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  if (!isParcelGeometry(body.geometry)) return json({ error: 'A Polygon or MultiPolygon parcel geometry is required' }, 400)

  const results = await Promise.allSettled([
    queryLayer(LAYERS.flood, body.geometry),
    queryLayer(LAYERS.wetlands, body.geometry),
    queryLayer(LAYERS.soils, body.geometry),
  ])

  return json({
    checkedAt: new Date().toISOString(),
    analysisLevel: 'parcel-feature-query',
    flood: results[0].status === 'fulfilled' ? { source: LAYERS.flood.source, features: results[0].value } : null,
    wetlands: results[1].status === 'fulfilled' ? { source: LAYERS.wetlands.source, features: results[1].value } : null,
    soils: results[2].status === 'fulfilled' ? { source: LAYERS.soils.source, features: results[2].value } : null,
    unavailable: [
      results[0].status === 'rejected' ? LAYERS.flood.source : null,
      results[1].status === 'rejected' ? LAYERS.wetlands.source : null,
      results[2].status === 'rejected' ? LAYERS.soils.source : null,
    ].filter(Boolean),
    limitation: 'This endpoint returns authoritative mapped features that intersect the submitted GIS parcel. Final acreage/percent calculations happen in the ATLAS client against the same parcel geometry. Mapping is screening evidence, not a survey or field determination.',
  })
}
