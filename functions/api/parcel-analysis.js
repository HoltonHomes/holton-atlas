const LAYERS = {
  flood: {
    url: 'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Flood_Hazard_Reduced_Set_gdb/FeatureServer/0/query',
    outFields: 'FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE',
    source: 'FEMA NFHL via Esri',
  },
  wetlands: {
    url: 'https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0/query',
    outFields: 'Wetlands.WETLAND_TYPE,Wetlands.ATTRIBUTE,Wetlands.ACRES',
    source: 'USFWS National Wetlands Inventory',
  },
  soils: {
    url: 'https://apps.geo.fpac.usda.gov/nrcs-geodata/rest/services/soils/cg_soils/MapServer/0/query',
    outFields: 'muname,musym,farmlndcl,nirrcapcl,areasymbol',
    source: 'USDA NRCS SSURGO',
  },
  waterbodies: {
    url: 'https://hydro.nationalmap.gov/arcgis/rest/services/NHDPlus_HR/MapServer/9/query',
    outFields: 'gnis_name,ftype,fcode,areasqkm',
    source: 'USGS National Hydrography Dataset waterbodies',
  },
  streams: {
    url: 'https://hydro.nationalmap.gov/arcgis/rest/services/NHDPlus_HR/MapServer/3/query',
    source: 'USGS National Hydrography Dataset flowlines',
  },
}

const TERRAIN = {
  url: 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/computeStatisticsHistograms',
  source: 'USGS 3DEP elevation',
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=86400',
    },
  })
}

function isParcelGeometry(value) {
  if (!value || typeof value !== 'object') return false
  return (value.type === 'Polygon' || value.type === 'MultiPolygon') && Array.isArray(value.coordinates)
}

function toEsriRings(geometry) {
  return geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat()
}

function normalizeFeatures(payload) {
  if (!Array.isArray(payload && payload.features)) return []

  return payload.features.flatMap((row) => {
    const properties = (row && (row.properties || row.attributes)) || {}
    const geometry = row && row.geometry

    if (geometry && (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon')) {
      return [{ type: 'Feature', properties, geometry: { type: geometry.type, coordinates: geometry.coordinates } }]
    }

    if (geometry && Array.isArray(geometry.rings)) {
      return [{ type: 'Feature', properties, geometry: { type: 'Polygon', coordinates: geometry.rings } }]
    }

    return []
  })
}

async function queryLayer(config, parcel) {
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
      const payload = await response.json()
      if (payload && payload.error) continue
      return normalizeFeatures(payload)
    } catch {
      // Try the alternate ArcGIS response format before giving up.
    }
  }

  throw new Error(`${config.source} unavailable`)
}

async function queryCount(config, parcel) {
  const geometry = JSON.stringify({ rings: toEsriRings(parcel), spatialReference: { wkid: 4326 } })
  const body = new URLSearchParams({
    geometry,
    geometryType: 'esriGeometryPolygon',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    returnCountOnly: 'true',
    f: 'json',
  })
  const response = await fetch(config.url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', 'user-agent': 'ATLAS by Holton Homes' },
    body,
  })
  if (!response.ok) throw new Error(`${config.source} unavailable`)
  const payload = await response.json()
  if (payload && payload.error) throw new Error(`${config.source} unavailable`)
  return Number.isFinite(payload && payload.count) ? payload.count : 0
}

async function sampleSlope(parcel) {
  const geometry = JSON.stringify({ rings: toEsriRings(parcel), spatialReference: { wkid: 4326 } })
  const body = new URLSearchParams({
    geometry,
    geometryType: 'esriGeometryPolygon',
    renderingRule: JSON.stringify({ rasterFunction: 'Slope Degrees' }),
    pixelSize: JSON.stringify({ x: 5, y: 5, spatialReference: { wkid: 3857 } }),
    f: 'json',
  })
  const response = await fetch(TERRAIN.url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', 'user-agent': 'ATLAS by Holton Homes' },
    body,
  })
  if (!response.ok) throw new Error(`${TERRAIN.source} unavailable`)
  const payload = await response.json()
  if (payload && payload.error) throw new Error(`${TERRAIN.source} unavailable`)

  const histogram = Array.isArray(payload && payload.histograms) ? payload.histograms[0] : null
  const counts = Array.isArray(histogram && histogram.counts) ? histogram.counts : []
  const size = Number(histogram && histogram.size)
  const min = Number(histogram && histogram.min)
  const max = Number(histogram && histogram.max)
  if (!counts.length || !Number.isFinite(size) || size <= 0 || !Number.isFinite(min) || !Number.isFinite(max)) throw new Error(`${TERRAIN.source} unavailable`)

  const total = counts.reduce((sum, count) => sum + (Number.isFinite(count) ? count : 0), 0)
  if (!total) throw new Error(`${TERRAIN.source} unavailable`)
  const bucketWidth = (max - min) / size
  const countRange = (from, to) => counts.reduce((sum, count, index) => {
    const center = min + (index + 0.5) * bucketWidth
    return center >= from && center < to ? sum + count : sum
  }, 0)
  const percent = (count) => Math.round(count / total * 1000) / 10
  return {
    source: TERRAIN.source,
    sampleCount: total,
    under5Percent: percent(countRange(0, 5)),
    fiveTo10Percent: percent(countRange(5, 10)),
    over10Percent: percent(countRange(10, Number.POSITIVE_INFINITY)),
  }
}

export async function onRequestPost({ request }) {
  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  if (!isParcelGeometry(body && body.geometry)) {
    return json({ error: 'A Polygon or MultiPolygon parcel geometry is required' }, 400)
  }

  const results = await Promise.allSettled([
    queryLayer(LAYERS.flood, body.geometry),
    queryLayer(LAYERS.wetlands, body.geometry),
    queryLayer(LAYERS.soils, body.geometry),
    queryLayer(LAYERS.waterbodies, body.geometry),
    queryCount(LAYERS.streams, body.geometry),
    sampleSlope(body.geometry),
  ])

  return json({
    checkedAt: new Date().toISOString(),
    analysisLevel: 'parcel-feature-query',
    flood: results[0].status === 'fulfilled' ? { source: LAYERS.flood.source, features: results[0].value } : null,
    wetlands: results[1].status === 'fulfilled' ? { source: LAYERS.wetlands.source, features: results[1].value } : null,
    soils: results[2].status === 'fulfilled' ? { source: LAYERS.soils.source, features: results[2].value } : null,
    water: results[3].status === 'fulfilled' || results[4].status === 'fulfilled' ? {
      source: 'USGS National Hydrography Dataset',
      waterbodies: results[3].status === 'fulfilled' ? { source: LAYERS.waterbodies.source, features: results[3].value } : null,
      streamCount: results[4].status === 'fulfilled' ? results[4].value : null,
    } : null,
    slope: results[5].status === 'fulfilled' ? results[5].value : null,
    unavailable: [
      results[0].status === 'rejected' ? LAYERS.flood.source : null,
      results[1].status === 'rejected' ? LAYERS.wetlands.source : null,
      results[2].status === 'rejected' ? LAYERS.soils.source : null,
      results[3].status === 'rejected' ? LAYERS.waterbodies.source : null,
      results[4].status === 'rejected' ? LAYERS.streams.source : null,
      results[5].status === 'rejected' ? TERRAIN.source : null,
    ].filter(Boolean),
    limitation: 'This endpoint returns mapped features and terrain samples for the submitted GIS parcel. ATLAS calculates acreage and percentages against that same geometry. Mapping is screening evidence, not a survey, engineering result or field determination.',
  })
}
