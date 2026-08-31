type ArcFeature = {
  attributes?: Record<string, unknown>
  geometry?: { rings?: number[][][] }
}

export type IntelligenceStatus = 'Verified' | 'Likely' | 'Requires Verification' | 'Problem'

export type IntelligenceFinding = {
  key: 'soil' | 'flood' | 'wetlands' | 'terrain'
  label: string
  status: IntelligenceStatus
  value: string
  detail: string
  source: string
}

export type PropertyIntelligence = {
  soil: IntelligenceFinding
  flood: IntelligenceFinding
  wetlands: IntelligenceFinding
  terrain: IntelligenceFinding
  checkedAt: string
}

export const INTELLIGENCE_OVERLAYS = {
  Terrain: {
    tile: 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage?f=image&format=png32&transparent=true&renderingRule=%7B%22rasterFunction%22%3A%22Hillshade%20Gray%22%7D&bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256%2C256',
    opacity: 0.72,
  },
  Topography: {
    tile: 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage?f=image&format=png32&transparent=true&renderingRule=%7B%22rasterFunction%22%3A%22Preset%2010ft%20Contour%20Interval%22%7D&bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256%2C256',
    opacity: 0.82,
  },
  Slope: {
    tile: 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage?f=image&format=png32&transparent=true&renderingRule=%7B%22rasterFunction%22%3A%22Slope%20Map%22%7D&bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256%2C256',
    opacity: 0.62,
  },
  Soils: {
    tile: 'https://apps.geo.fpac.usda.gov/nrcs-geodata/rest/services/soils/cg_soils/MapServer/export?dpi=96&transparent=true&format=png32&layers=show%3A0&bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256%2C256&f=image',
    opacity: 0.78,
  },
  Water: {
    tile: 'https://hydro.nationalmap.gov/arcgis/rest/services/NHDPlus_HR/MapServer/export?dpi=96&transparent=true&format=png32&layers=show%3A3%2C9&bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256%2C256&f=image',
    opacity: 0.9,
  },
  Flood: {
    tile: '/api/map-tile?layer=flood&bbox={bbox-epsg-3857}',
    opacity: 0.78,
  },
  Wetlands: {
    tile: '/api/map-tile?layer=wetlands&bbox={bbox-epsg-3857}',
    opacity: 0.82,
  },
} as const

function jsonp<T>(baseUrl: string, params: Record<string, string>, timeoutMs = 12000): Promise<T> {
  return new Promise((resolve, reject) => {
    const callbackName = `__atlas_intel_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const script = document.createElement('script')
    const url = new URL(baseUrl)
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
    url.searchParams.set('f', 'json')
    url.searchParams.set('callback', callbackName)

    const cleanup = () => {
      window.clearTimeout(timer)
      script.remove()
      delete (window as any)[callbackName]
    }

    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('Public data request timed out'))
    }, timeoutMs)

    ;(window as any)[callbackName] = (data: T) => {
      cleanup()
      resolve(data)
    }

    script.onerror = () => {
      cleanup()
      reject(new Error('Public data request failed'))
    }

    script.src = url.toString()
    document.head.appendChild(script)
  })
}

async function queryPoint(url: string, longitude: number, latitude: number, outFields: string) {
  const data = await jsonp<{ features?: ArcFeature[]; error?: unknown }>(url, {
    geometry: `${longitude},${latitude}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    returnGeometry: 'false',
    outFields,
  })
  if (data.error) throw new Error('GIS source returned an error')
  return data.features?.[0]?.attributes ?? null
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

async function getSoil(longitude: number, latitude: number): Promise<IntelligenceFinding> {
  try {
    const attrs = await queryPoint(
      'https://apps.geo.fpac.usda.gov/nrcs-geodata/rest/services/soils/cg_soils/MapServer/0/query',
      longitude,
      latitude,
      'muname,musym,farmlndcl,nirrcapcl,areasymbol',
    )
    if (!attrs) {
      return { key: 'soil', label: 'Soil', status: 'Requires Verification', value: 'No SSURGO map unit returned', detail: 'ATLAS could not identify a USDA soil map unit at the address point.', source: 'USDA NRCS SSURGO' }
    }
    const name = text(attrs.muname) ?? text(attrs.MUNAME) ?? 'Mapped soil unit'
    const farmland = text(attrs.farmlndcl) ?? text(attrs.FARMLNDCL)
    const capability = attrs.nirrcapcl ?? attrs.NIRRCAPCL
    const detail = [farmland ? `Farmland class: ${farmland}.` : null, capability ? `Non-irrigated capability class: ${capability}.` : null, 'Point-level soil result; the full parcel can contain multiple soil units.'].filter(Boolean).join(' ')
    return { key: 'soil', label: 'Soil', status: 'Verified', value: name, detail, source: 'USDA NRCS SSURGO' }
  } catch {
    return { key: 'soil', label: 'Soil', status: 'Requires Verification', value: 'Soil source unavailable', detail: 'USDA soil data could not be reached during this check.', source: 'USDA NRCS SSURGO' }
  }
}

async function getFlood(longitude: number, latitude: number): Promise<IntelligenceFinding> {
  try {
    const attrs = await queryPoint(
      'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Flood_Hazard_Reduced_Set_gdb/FeatureServer/0/query',
      longitude,
      latitude,
      'FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE',
    )
    if (!attrs) {
      return { key: 'flood', label: 'Flood', status: 'Likely', value: 'No mapped FEMA hazard at address point', detail: 'The geocoded address point does not intersect a mapped FEMA flood-hazard polygon. This is not yet a full-parcel intersection.', source: 'FEMA NFHL via Esri' }
    }
    const zone = text(attrs.FLD_ZONE) ?? 'Mapped flood zone'
    const subtype = text(attrs.ZONE_SUBTY)
    const sfha = text(attrs.SFHA_TF)?.toUpperCase() === 'T'
    return {
      key: 'flood',
      label: 'Flood',
      status: sfha ? 'Problem' : 'Requires Verification',
      value: subtype ? `${zone} · ${subtype}` : `Zone ${zone}`,
      detail: sfha ? 'The address point intersects a Special Flood Hazard Area. Confirm parcel-wide exposure and insurance/building implications.' : 'A FEMA flood-hazard polygon intersects the address point; review the mapped zone and parcel-wide exposure.',
      source: 'FEMA NFHL via Esri',
    }
  } catch {
    return { key: 'flood', label: 'Flood', status: 'Requires Verification', value: 'Flood source unavailable', detail: 'FEMA flood data could not be reached during this check.', source: 'FEMA NFHL' }
  }
}

async function getWetlands(longitude: number, latitude: number): Promise<IntelligenceFinding> {
  try {
    const attrs = await queryPoint(
      'https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0/query',
      longitude,
      latitude,
      '*',
    )
    if (!attrs) {
      return { key: 'wetlands', label: 'Wetlands', status: 'Likely', value: 'No NWI wetland at address point', detail: 'No mapped NWI wetland polygon intersects the geocoded address point. This does not rule out wetlands elsewhere on the parcel or unmapped field conditions.', source: 'USFWS National Wetlands Inventory' }
    }
    const wetlandType = text(attrs.WETLAND_TYPE) ?? text(attrs.WETLAND_TY) ?? text(attrs.ATTRIBUTE) ?? 'Mapped wetland'
    const code = text(attrs.ATTRIBUTE)
    return { key: 'wetlands', label: 'Wetlands', status: 'Requires Verification', value: wetlandType, detail: `${code ? `NWI code ${code}. ` : ''}Mapped NWI data is a screening source, not a jurisdictional wetland determination.`, source: 'USFWS National Wetlands Inventory' }
  } catch {
    return { key: 'wetlands', label: 'Wetlands', status: 'Requires Verification', value: 'Wetlands source unavailable', detail: 'USFWS wetlands data could not be reached during this check.', source: 'USFWS NWI' }
  }
}

async function getTerrain(longitude: number, latitude: number): Promise<IntelligenceFinding> {
  try {
    const url = new URL('https://epqs.nationalmap.gov/v1/json')
    url.searchParams.set('x', String(longitude))
    url.searchParams.set('y', String(latitude))
    url.searchParams.set('units', 'Feet')
    url.searchParams.set('wkid', '4326')
    url.searchParams.set('includeDate', 'False')
    const response = await fetch(url)
    if (!response.ok) throw new Error('Elevation service unavailable')
    const data = await response.json() as { value?: number; resolution?: number }
    if (typeof data.value !== 'number' || !Number.isFinite(data.value)) throw new Error('No elevation returned')
    return { key: 'terrain', label: 'Terrain', status: 'Likely', value: `${Math.round(data.value).toLocaleString()} ft elevation`, detail: `USGS 3DEP interpolated point elevation${data.resolution ? ` at roughly ${data.resolution} m source resolution` : ''}. Use the Terrain, Topography and Slope layers to read the surrounding landform; this is not a surveyed elevation.`, source: 'USGS 3DEP / EPQS' }
  } catch {
    return { key: 'terrain', label: 'Terrain', status: 'Requires Verification', value: 'Elevation source unavailable', detail: 'USGS elevation data could not be reached during this check. Terrain map layers remain available.', source: 'USGS 3DEP' }
  }
}

export async function getPropertyIntelligence(longitude: number, latitude: number): Promise<PropertyIntelligence> {
  const [soil, flood, wetlands, terrain] = await Promise.all([
    getSoil(longitude, latitude),
    getFlood(longitude, latitude),
    getWetlands(longitude, latitude),
    getTerrain(longitude, latitude),
  ])

  return { soil, flood, wetlands, terrain, checkedAt: new Date().toISOString() }
}
