import type { ParcelFeature } from './ohioProperty'
import { isParcelGeometry, overlapAcres, parcelAcres as calculateParcelAcres } from '../engine/land/parcelGeometry'
import type { ParcelGeometry } from '../engine/land/parcelGeometry'

type ArcFeature = {
  attributes?: Record<string, unknown>
  geometry?: { rings?: number[][][] }
}

type ParcelOverlayFeature = {
  type: 'Feature'
  properties: Record<string, unknown>
  geometry: ParcelGeometry
}

type ParcelFeatureQuery = {
  source: string
  features: ParcelOverlayFeature[]
}

type ParcelFeatureQueryResponse = {
  checkedAt: string
  analysisLevel: 'parcel-feature-query'
  flood: ParcelFeatureQuery | null
  wetlands: ParcelFeatureQuery | null
  soils: ParcelFeatureQuery | null
  unavailable: string[]
  limitation: string
  error?: string
}

export type IntelligenceStatus = 'Verified' | 'Screened' | 'Likely' | 'Requires Verification' | 'Problem'

export type IntelligenceFinding = {
  key: 'soil' | 'flood' | 'wetlands' | 'terrain'
  label: string
  status: IntelligenceStatus
  value: string
  detail: string
  source: string
}

export type ParcelSoilUnit = {
  name: string
  symbol: string | null
  farmland: string | null
  capability: string | null
  acres: number
  percent: number
}

export type ParcelAnalysis = {
  checkedAt: string
  parcelAcres: number
  analysisLevel: 'parcel-intersection'
  flood: null | {
    source: string
    intersectingFeatures: number
    mappedAcres: number
    mappedPercent: number
    sfhaAcres: number
    sfhaPercent: number
    zones: string[]
  }
  wetlands: null | {
    source: string
    intersectingFeatures: number
    mappedAcres: number
    mappedPercent: number
    types: string[]
  }
  soils: null | {
    source: string
    intersectingFeatures: number
    coveredAcres: number
    coveredPercent: number
    dominantUnit: ParcelSoilUnit | null
    units: ParcelSoilUnit[]
  }
  unavailable: string[]
  limitation: string
}

export type PropertyIntelligence = {
  soil: IntelligenceFinding
  flood: IntelligenceFinding
  wetlands: IntelligenceFinding
  terrain: IntelligenceFinding
  checkedAt: string
  parcelAnalysis?: ParcelAnalysis | null
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

function propertyValue(properties: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const direct = properties[key]
    if (direct !== undefined && direct !== null && direct !== '') return direct
    const matchedKey = Object.keys(properties).find((candidate) => candidate.toLowerCase() === key.toLowerCase())
    if (matchedKey) {
      const value = properties[matchedKey]
      if (value !== undefined && value !== null && value !== '') return value
    }
  }
  return null
}

function propertyText(properties: Record<string, unknown>, ...keys: string[]) {
  const value = propertyValue(properties, ...keys)
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (value !== null && value !== undefined) return String(value)
  return null
}

function rounded(value: number, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function percentage(acres: number, totalAcres: number) {
  if (!Number.isFinite(totalAcres) || totalAcres <= 0) return 0
  return Math.min(100, Math.max(0, acres / totalAcres * 100))
}

function validOverlayFeatures(query: ParcelFeatureQuery | null | undefined) {
  if (!query?.features?.length) return []
  return query.features.filter((row) => row?.type === 'Feature' && isParcelGeometry(row.geometry))
}

function summarizeFlood(parcel: ParcelGeometry, totalAcres: number, query: ParcelFeatureQuery | null) {
  if (!query) return null
  const features = validOverlayFeatures(query)
  let mappedAcres = 0
  let sfhaAcres = 0
  let intersectingFeatures = 0
  const zones = new Set<string>()

  for (const row of features) {
    const acres = overlapAcres(parcel, row.geometry)
    if (acres <= 0) continue
    intersectingFeatures += 1
    mappedAcres += acres

    const zone = propertyText(row.properties, 'FLD_ZONE')
    const subtype = propertyText(row.properties, 'ZONE_SUBTY')
    if (zone) zones.add(subtype ? `${zone} · ${subtype}` : zone)

    const sfha = propertyText(row.properties, 'SFHA_TF')?.toUpperCase()
    if (sfha === 'T' || sfha === 'TRUE' || sfha === 'Y' || sfha === 'YES') sfhaAcres += acres
  }

  mappedAcres = Math.min(totalAcres, mappedAcres)
  sfhaAcres = Math.min(totalAcres, sfhaAcres)

  return {
    source: query.source,
    intersectingFeatures,
    mappedAcres: rounded(mappedAcres),
    mappedPercent: rounded(percentage(mappedAcres, totalAcres), 1),
    sfhaAcres: rounded(sfhaAcres),
    sfhaPercent: rounded(percentage(sfhaAcres, totalAcres), 1),
    zones: [...zones].slice(0, 8),
  }
}

function summarizeWetlands(parcel: ParcelGeometry, totalAcres: number, query: ParcelFeatureQuery | null) {
  if (!query) return null
  const features = validOverlayFeatures(query)
  let mappedAcres = 0
  let intersectingFeatures = 0
  const types = new Set<string>()

  for (const row of features) {
    const acres = overlapAcres(parcel, row.geometry)
    if (acres <= 0) continue
    intersectingFeatures += 1
    mappedAcres += acres
    const type = propertyText(row.properties, 'WETLAND_TYPE', 'WETLAND_TY', 'ATTRIBUTE')
    if (type) types.add(type)
  }

  mappedAcres = Math.min(totalAcres, mappedAcres)
  return {
    source: query.source,
    intersectingFeatures,
    mappedAcres: rounded(mappedAcres),
    mappedPercent: rounded(percentage(mappedAcres, totalAcres), 1),
    types: [...types].slice(0, 8),
  }
}

function summarizeSoils(parcel: ParcelGeometry, totalAcres: number, query: ParcelFeatureQuery | null) {
  if (!query) return null
  const features = validOverlayFeatures(query)
  const units = new Map<string, Omit<ParcelSoilUnit, 'percent'>>()
  let intersectingFeatures = 0

  for (const row of features) {
    const acres = overlapAcres(parcel, row.geometry)
    if (acres <= 0) continue
    intersectingFeatures += 1

    const name = propertyText(row.properties, 'muname', 'MUNAME') ?? 'Mapped soil unit'
    const symbol = propertyText(row.properties, 'musym', 'MUSYM')
    const farmland = propertyText(row.properties, 'farmlndcl', 'FARMLNDCL')
    const capability = propertyText(row.properties, 'nirrcapcl', 'NIRRCAPCL')
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

  const rows: ParcelSoilUnit[] = [...units.values()]
    .map((unit) => ({
      ...unit,
      acres: rounded(unit.acres),
      percent: rounded(percentage(unit.acres, totalAcres), 1),
    }))
    .sort((a, b) => b.acres - a.acres)

  const coveredAcres = Math.min(totalAcres, rows.reduce((sum, row) => sum + row.acres, 0))
  return {
    source: query.source,
    intersectingFeatures,
    coveredAcres: rounded(coveredAcres),
    coveredPercent: rounded(percentage(coveredAcres, totalAcres), 1),
    dominantUnit: rows[0] ?? null,
    units: rows.slice(0, 12),
  }
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
      return { key: 'flood', label: 'Flood', status: 'Screened', value: 'No mapped FEMA hazard at address point', detail: 'The geocoded address point does not intersect a mapped FEMA flood-hazard polygon. This is not yet a full-parcel intersection.', source: 'FEMA NFHL via Esri' }
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
    const url = `/api/intelligence?layer=wetlands&longitude=${encodeURIComponent(longitude)}&latitude=${encodeURIComponent(latitude)}`
    let response = await fetch(url)
    if (!response.ok) response = await fetch(url)
    if (!response.ok) throw new Error('Wetlands source unavailable')
    const data = await response.json() as { features?: ArcFeature[]; error?: unknown }
    if (data.error) throw new Error('Wetlands source unavailable')
    const attrs = data.features?.[0]?.attributes ?? null
    if (!attrs) {
      return { key: 'wetlands', label: 'Wetlands', status: 'Screened', value: 'No NWI wetland at address point', detail: 'No mapped NWI wetland polygon intersects the geocoded address point. This does not rule out wetlands elsewhere on the parcel or unmapped field conditions.', source: 'USFWS National Wetlands Inventory' }
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
    return { key: 'terrain', label: 'Terrain', status: 'Screened', value: `${Math.round(data.value).toLocaleString()} ft elevation`, detail: `USGS 3DEP interpolated point elevation${data.resolution ? ` at roughly ${data.resolution} m source resolution` : ''}. Use the Terrain, Topography and Slope layers to read the surrounding landform; this is not a surveyed elevation.`, source: 'USGS 3DEP / EPQS' }
  } catch {
    return { key: 'terrain', label: 'Terrain', status: 'Requires Verification', value: 'Elevation source unavailable', detail: 'USGS elevation data could not be reached during this check. Terrain map layers remain available.', source: 'USGS 3DEP' }
  }
}

export async function getParcelIntelligence(parcel: ParcelFeature): Promise<ParcelAnalysis | null> {
  if (!isParcelGeometry(parcel.geometry)) return null
  const parcelGeometry = parcel.geometry as ParcelGeometry

  try {
    const response = await fetch('/api/parcel-analysis', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ geometry: parcelGeometry }),
    })
    if (!response.ok) return null

    const data = await response.json() as ParcelFeatureQueryResponse
    if (data.error || data.analysisLevel !== 'parcel-feature-query') return null

    const totalAcres = calculateParcelAcres(parcelGeometry)
    if (!Number.isFinite(totalAcres) || totalAcres <= 0) return null

    return {
      checkedAt: data.checkedAt,
      parcelAcres: rounded(totalAcres),
      analysisLevel: 'parcel-intersection',
      flood: summarizeFlood(parcelGeometry, totalAcres, data.flood),
      wetlands: summarizeWetlands(parcelGeometry, totalAcres, data.wetlands),
      soils: summarizeSoils(parcelGeometry, totalAcres, data.soils),
      unavailable: Array.isArray(data.unavailable) ? data.unavailable : [],
      limitation: 'ATLAS calculated overlap acreage against the recorded GIS parcel using mapped FEMA, NWI and USDA features. GIS parcel boundaries are not surveys, and mapped environmental data does not replace field or jurisdictional determinations.',
    }
  } catch {
    return null
  }
}

export function mergeParcelIntelligence(intelligence: PropertyIntelligence, parcelAnalysis: ParcelAnalysis | null): PropertyIntelligence {
  if (!parcelAnalysis) return { ...intelligence, parcelAnalysis: null }

  let flood = intelligence.flood
  if (parcelAnalysis.flood) {
    const result = parcelAnalysis.flood
    if (result.sfhaPercent > 0) {
      flood = {
        key: 'flood',
        label: 'Flood',
        status: 'Problem',
        value: `${result.sfhaPercent.toFixed(1)}% of parcel in mapped FEMA SFHA`,
        detail: `${result.sfhaAcres.toFixed(2)} mapped acres intersect a Special Flood Hazard Area${result.zones.length ? ` (${result.zones.join(', ')})` : ''}. This is a parcel-wide GIS screen; confirm insurance, building and site implications with the appropriate official/professional sources.`,
        source: result.source,
      }
    } else if (result.mappedPercent > 0) {
      flood = {
        key: 'flood',
        label: 'Flood',
        status: 'Requires Verification',
        value: `${result.mappedPercent.toFixed(1)}% of parcel intersects mapped FEMA flood data`,
        detail: `${result.mappedAcres.toFixed(2)} mapped acres intersect FEMA flood-hazard mapping, but the returned parcel intersection is not classified as a Special Flood Hazard Area. Review the mapped zone before relying on the area for a project.`,
        source: result.source,
      }
    } else {
      flood = {
        key: 'flood',
        label: 'Flood',
        status: 'Screened',
        value: 'No mapped FEMA flood polygon intersects the parcel',
        detail: 'ATLAS screened the recorded parcel geometry against the available FEMA flood layer. This is stronger than an address-point check but is still mapping evidence, not a guarantee of future flooding or drainage conditions.',
        source: result.source,
      }
    }
  }

  let wetlands = intelligence.wetlands
  if (parcelAnalysis.wetlands) {
    const result = parcelAnalysis.wetlands
    if (result.mappedPercent > 0) {
      wetlands = {
        key: 'wetlands',
        label: 'Wetlands',
        status: 'Requires Verification',
        value: `${result.mappedPercent.toFixed(1)}% of parcel overlaps mapped NWI wetlands`,
        detail: `${result.mappedAcres.toFixed(2)} mapped acres overlap National Wetlands Inventory polygons${result.types.length ? ` (${result.types.slice(0, 3).join(', ')})` : ''}. NWI is a screening source, not a jurisdictional wetland determination.`,
        source: result.source,
      }
    } else {
      wetlands = {
        key: 'wetlands',
        label: 'Wetlands',
        status: 'Screened',
        value: 'No mapped NWI wetland intersects the parcel',
        detail: 'ATLAS screened the recorded parcel geometry against National Wetlands Inventory mapping. Unmapped or field-confirmed wetland conditions can still exist.',
        source: result.source,
      }
    }
  }

  let soil = intelligence.soil
  if (parcelAnalysis.soils?.dominantUnit) {
    const result = parcelAnalysis.soils
    const dominant = result.dominantUnit
    const unitCount = result.units.length
    soil = {
      key: 'soil',
      label: 'Soil',
      status: 'Screened',
      value: `${dominant.name} · ${dominant.percent.toFixed(1)}% of mapped parcel`,
      detail: `${dominant.acres.toFixed(2)} acres are mapped as the dominant soil unit${unitCount > 1 ? `; ATLAS found ${unitCount} soil units across the parcel` : ''}.${dominant.farmland ? ` Farmland class: ${dominant.farmland}.` : ''}${dominant.capability ? ` Non-irrigated capability class: ${dominant.capability}.` : ''} USDA mapping is useful planning evidence but not a site-specific soil or septic test.`,
      source: result.source,
    }
  }

  return {
    ...intelligence,
    flood,
    wetlands,
    soil,
    parcelAnalysis,
    checkedAt: parcelAnalysis.checkedAt || intelligence.checkedAt,
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
