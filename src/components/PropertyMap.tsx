import { useEffect, useMemo, useRef, useState } from 'react'
import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl } from 'maplibre-gl'
import type { GeoJSONSource, StyleSpecification } from 'maplibre-gl'
import { booleanPointInPolygon, point } from '@turf/turf'
import type { LocatedProperty, ParcelFeature } from '../services/ohioProperty'
import { INTELLIGENCE_OVERLAYS } from '../services/propertyIntelligence'
import AtlasWorld from './world/AtlasWorld'

export type BaseMapMode = 'Aerial' | 'Terrain' | 'Topographic'
export type PlannerName = 'Barn' | 'Garden' | 'Poultry' | 'Pasture' | 'Goats' | 'Orchard' | 'Pond' | 'Driveway'
export type PlanSummary = { count: number; byType: Partial<Record<PlannerName, number>> }

type PlannerItem = { name: PlannerName; icon: string; color: string; overlays: string[] }
type PlannerPlacement = { id: number; name: PlannerName; longitude: number; latitude: number }

const PLANNER_ITEMS: PlannerItem[] = [
  { name: 'Barn', icon: '⌂', color: '#d95f82', overlays: ['Flood', 'Wetlands'] },
  { name: 'Garden', icon: '◫', color: '#94647a', overlays: ['Soils', 'Water'] },
  { name: 'Poultry', icon: '◉', color: '#b46a85', overlays: ['Flood'] },
  { name: 'Pasture', icon: '▱', color: '#766779', overlays: ['Soils', 'Water'] },
  { name: 'Goats', icon: '◇', color: '#8b6176', overlays: ['Soils', 'Water', 'Flood'] },
  { name: 'Orchard', icon: '♢', color: '#ad6984', overlays: ['Soils', 'Water'] },
  { name: 'Pond', icon: '≈', color: '#526b86', overlays: ['Water', 'Wetlands'] },
  { name: 'Driveway', icon: '↗', color: '#586576', overlays: ['Water'] },
]

const BASEMAPS: Record<BaseMapMode, { tile: string; attribution: string; maxZoom: number }> = {
  Aerial: {
    tile: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagery © Esri and contributors',
    maxZoom: 20,
  },
  Terrain: {
    tile: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagery © Esri and contributors',
    maxZoom: 20,
  },
  Topographic: {
    tile: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Topographic map © Esri and contributors',
    maxZoom: 19,
  },
}

function styleFor(mode: BaseMapMode): StyleSpecification {
  const base = BASEMAPS[mode]
  const style: StyleSpecification = {
    version: 8,
    sources: {
      'atlas-base': { type: 'raster', tiles: [base.tile], tileSize: 256, attribution: base.attribution, maxzoom: base.maxZoom },
    },
    layers: [{ id: 'atlas-base-layer', type: 'raster', source: 'atlas-base' }],
  }
  if (mode === 'Terrain') {
    ;(style.sources as Record<string, unknown>)['atlas-terrain-dem'] = {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 15,
      attribution: 'Elevation © Mapzen / AWS Terrain Tiles',
    }
  }
  return style
}

function extendBounds(bounds: LngLatBounds, coordinates: unknown) {
  if (!Array.isArray(coordinates)) return
  if (coordinates.length >= 2 && typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
    bounds.extend([coordinates[0], coordinates[1]])
    return
  }
  coordinates.forEach((coordinate) => extendBounds(bounds, coordinate))
}

function overlayId(name: string) {
  return `atlas-overlay-${name.toLowerCase().replaceAll(' ', '-')}`
}

function locationInsideParcel(parcel: ParcelFeature | null, longitude: number, latitude: number) {
  if (!parcel?.geometry || (parcel.geometry.type !== 'Polygon' && parcel.geometry.type !== 'MultiPolygon')) return false
  try {
    return booleanPointInPolygon(point([longitude, latitude]), parcel.geometry as any)
  } catch {
    return false
  }
}

export default function PropertyMap({
  property,
  parcel,
  parcelVerified,
  compact = false,
  planningMode = false,
  planningTool,
  onPlanChange,
}: {
  property: LocatedProperty
  parcel: ParcelFeature | null
  parcelVerified: boolean
  compact?: boolean
  planningMode?: boolean
  planningTool?: PlannerName
  onPlanChange?: (summary: PlanSummary) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const planningMarkersRef = useRef<Map<number, Marker>>(new Map())
  const parcelRef = useRef<ParcelFeature | null>(parcel)
  // Guards against the "map glitches" symptom: without these, every map
  // (re)creation was immediately followed by a redundant setStyle() call
  // from the basemap-sync effect below (a visible double tile-load/flicker
  // on every property search), and rapid basemap clicks could let a stale
  // style.load callback from an earlier click paint over a newer one.
  const skipNextStyleSyncRef = useRef(false)
  const styleRequestRef = useRef(0)
  const [baseMap, setBaseMap] = useState<BaseMapMode>('Aerial')
  const [activeOverlays, setActiveOverlays] = useState<string[]>([])
  const [mapStatus, setMapStatus] = useState('Map ready')
  const [layerStatus, setLayerStatus] = useState<Record<string, 'loading' | 'visible' | 'error'>>({})
  const [plannerOpen, setPlannerOpen] = useState(planningMode)
  const [plannerTool, setPlannerTool] = useState<PlannerName>(planningTool ?? 'Barn')
  const [placements, setPlacements] = useState<PlannerPlacement[]>([])
  const [plannerMessage, setPlannerMessage] = useState('')
  const [worldOpen, setWorldOpen] = useState(false)
  const baseMapRef = useRef<BaseMapMode>(baseMap)
  const plannerOpenRef = useRef(plannerOpen || planningMode)
  const plannerToolRef = useRef<PlannerName>(plannerTool)
  baseMapRef.current = baseMap
  plannerOpenRef.current = plannerOpen || planningMode
  plannerToolRef.current = plannerTool
  parcelRef.current = parcel

  const overlayNames = useMemo(() => ['Soils', 'Water', 'Flood', 'Wetlands'], [])

  useEffect(() => {
    if (planningTool) setPlannerTool(planningTool)
  }, [planningTool])

  useEffect(() => {
    if (planningMode) {
      setPlannerOpen(true)
      setWorldOpen(false)
      setBaseMap('Aerial')
    }
  }, [planningMode])

  useEffect(() => {
    if (!containerRef.current) return
    // Build the map in whatever basemap is currently selected (it can carry
    // over from a previous property on the same instance) instead of always
    // hardcoding Aerial — that mismatch was what forced the redundant
    // setStyle() below on every single mount.
    const initialMode = planningMode ? 'Aerial' : baseMapRef.current
    const map = new MapLibreMap({
      container: containerRef.current,
      style: styleFor(initialMode),
      center: [property.longitude, property.latitude],
      zoom: 17,
      attributionControl: {},
      maxZoom: 20,
      maxPitch: 80,
    })
    map.addControl(new NavigationControl({ showCompass: !planningMode }), 'top-right')
    mapRef.current = map
    skipNextStyleSyncRef.current = true
    if (!planningMode) {
      markerRef.current = new Marker({ color: '#d95f82' }).setLngLat([property.longitude, property.latitude]).addTo(map)
    }

    map.on('load', () => {
      setMapStatus(`${initialMode} loaded`)
      if (initialMode === 'Terrain') map.setTerrain({ source: 'atlas-terrain-dem', exaggeration: 1.55 })
      drawParcel(map, parcelRef.current)
    })

    map.on('error', (event) => {
      const sourceId = (event as { sourceId?: string }).sourceId
      const failed = overlayNames.find((name) => sourceId === `${overlayId(name)}-source`)
      if (failed) {
        setLayerStatus((current) => ({ ...current, [failed]: 'error' }))
        return
      }
      setMapStatus('A map layer could not load')
    })

    map.on('sourcedata', (event) => {
      const loaded = overlayNames.find((name) => event.sourceId === `${overlayId(name)}-source`)
      if (loaded && event.isSourceLoaded) setLayerStatus((current) => ({ ...current, [loaded]: 'visible' }))
    })

    map.on('idle', () => {
      const settled = overlayNames.filter((name) => map.getLayer(overlayId(name)) && map.getSource(`${overlayId(name)}-source`))
      if (settled.length) {
        setLayerStatus((current) => {
          const next = { ...current }
          settled.forEach((name) => {
            if (next[name] !== 'error') next[name] = 'visible'
          })
          return next
        })
      }
    })

    map.on('click', (event) => {
      if (!plannerOpenRef.current) return
      const activeParcel = parcelRef.current
      if (!activeParcel) {
        setPlannerMessage('Verify the parcel boundary before placing concepts.')
        return
      }
      if (!locationInsideParcel(activeParcel, event.lngLat.lng, event.lngLat.lat)) {
        setPlannerMessage('Place concepts inside the verified parcel boundary.')
        return
      }
      setPlannerMessage('')
      const tool = plannerToolRef.current
      setPlacements((current) => [...current, { id: Date.now() + current.length, name: tool, longitude: event.lngLat.lng, latitude: event.lngLat.lat }])
    })

    return () => {
      markerRef.current?.remove()
      markerRef.current = null
      planningMarkersRef.current.forEach((marker) => marker.remove())
      planningMarkersRef.current.clear()
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property.latitude, property.longitude, planningMode])

  useEffect(() => {
    if (planningMode) return
    const map = mapRef.current
    if (!map) return
    // Skip the one style-sync that would otherwise immediately follow map
    // creation and reload tiles a second time for no reason.
    if (skipNextStyleSyncRef.current) {
      skipNextStyleSyncRef.current = false
      return
    }
    const requestId = ++styleRequestRef.current
    setMapStatus(`Loading ${baseMap}…`)
    map.once('style.load', () => {
      // A newer basemap click superseded this one before it finished
      // loading — don't let a stale callback draw over the current state.
      if (styleRequestRef.current !== requestId) return
      if (baseMap === 'Terrain') map.setTerrain({ source: 'atlas-terrain-dem', exaggeration: 1.55 })
      drawParcel(map, parcel)
      syncOverlays(map, activeOverlays)
      setMapStatus(`${baseMap} loaded`)
      map.once('idle', () => {
        if (styleRequestRef.current !== requestId) return
        map.easeTo({ pitch: baseMap === 'Terrain' ? 62 : 0, bearing: baseMap === 'Terrain' ? -18 : 0, duration: 900 })
      })
    })
    map.setStyle(styleFor(baseMap))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseMap, planningMode])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    drawParcel(map, parcel)
  }, [parcel])

  useEffect(() => {
    if (planningMode) return
    const map = mapRef.current
    if (!map) return
    syncOverlays(map, activeOverlays)
  }, [activeOverlays, planningMode])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const frame = window.requestAnimationFrame(() => {
      map.resize()
      drawParcel(map, parcel)
    })
    return () => window.cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact, planningMode])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.getCanvas().style.cursor = plannerOpenRef.current ? 'crosshair' : ''
  }, [plannerOpen, planningMode])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const liveIds = new Set(placements.map((placement) => placement.id))
    planningMarkersRef.current.forEach((marker, id) => {
      if (!liveIds.has(id)) {
        marker.remove()
        planningMarkersRef.current.delete(id)
      }
    })
    placements.forEach((placement) => {
      const existing = planningMarkersRef.current.get(placement.id)
      if (existing) {
        existing.setLngLat([placement.longitude, placement.latitude])
        return
      }
      const item = PLANNER_ITEMS.find((candidate) => candidate.name === placement.name)!
      const element = document.createElement('button')
      element.className = planningMode ? 'atlas-plan-marker configurator-marker' : 'atlas-plan-marker'
      element.style.setProperty('--plan-color', item.color)
      element.type = 'button'
      element.title = `${item.name} concept · drag to move`
      element.setAttribute('aria-label', `${item.name} concept; drag to move`)
      element.innerHTML = `<span>${item.icon}</span><strong>${item.name}</strong><small>concept</small>`
      const marker = new Marker({ element, draggable: true, anchor: 'bottom' }).setLngLat([placement.longitude, placement.latitude]).addTo(map)
      marker.on('dragend', () => {
        const location = marker.getLngLat()
        const activeParcel = parcelRef.current
        if (!activeParcel || !locationInsideParcel(activeParcel, location.lng, location.lat)) {
          marker.setLngLat([placement.longitude, placement.latitude])
          setPlannerMessage(activeParcel ? 'Concepts must stay inside the verified parcel boundary.' : 'Verify the parcel boundary before moving concepts.')
          return
        }
        setPlannerMessage('')
        setPlacements((current) => current.map((candidate) => candidate.id === placement.id ? { ...candidate, longitude: location.lng, latitude: location.lat } : candidate))
      })
      planningMarkersRef.current.set(placement.id, marker)
    })
  }, [placements, planningMode])

  useEffect(() => {
    if (!onPlanChange) return
    const byType: Partial<Record<PlannerName, number>> = {}
    placements.forEach((placement) => {
      byType[placement.name] = (byType[placement.name] ?? 0) + 1
    })
    onPlanChange({ count: placements.length, byType })
  }, [placements, onPlanChange])

  function drawParcel(map: MapLibreMap, nextParcel: ParcelFeature | null) {
    if (!nextParcel) return
    const feature = { type: 'Feature', geometry: nextParcel.geometry, properties: nextParcel.properties } as any
    const source = map.getSource('atlas-parcel') as GeoJSONSource | undefined
    if (source) source.setData(feature)
    else {
      map.addSource('atlas-parcel', { type: 'geojson', data: feature })
      map.addLayer({
        id: 'atlas-parcel-fill',
        type: 'fill',
        source: 'atlas-parcel',
        paint: { 'fill-color': planningMode ? '#fff8ef' : '#d95f82', 'fill-opacity': planningMode ? 0.08 : 0.12 },
      })
      map.addLayer({
        id: 'atlas-parcel-line',
        type: 'line',
        source: 'atlas-parcel',
        paint: { 'line-color': planningMode ? '#ffffff' : '#d95f82', 'line-width': planningMode ? 3 : 4, 'line-opacity': planningMode ? 0.92 : 1 },
      })
    }

    const bounds = new LngLatBounds()
    extendBounds(bounds, (nextParcel.geometry as { coordinates?: unknown }).coordinates)
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: planningMode ? 64 : compact ? 28 : 48, maxZoom: 18.5, duration: 650 })
  }

  function syncOverlays(map: MapLibreMap, overlays: string[]) {
    Object.entries(INTELLIGENCE_OVERLAYS).forEach(([name, definition]) => {
      if (!overlayNames.includes(name)) return
      const id = overlayId(name)
      const sourceId = `${id}-source`
      const shouldShow = overlays.includes(name)
      const exists = Boolean(map.getLayer(id))

      if (shouldShow && !exists) {
        setLayerStatus((current) => ({ ...current, [name]: 'loading' }))
        if (!map.getSource(sourceId)) map.addSource(sourceId, { type: 'raster', tiles: [definition.tile], tileSize: 256, minzoom: 6, maxzoom: 19 })
        map.addLayer({ id, type: 'raster', source: sourceId, paint: { 'raster-opacity': definition.opacity, 'raster-fade-duration': 0 } })
        setLayerStatus((current) => ({ ...current, [name]: 'visible' }))
      }

      if (!shouldShow && exists) {
        map.removeLayer(id)
        if (map.getSource(sourceId)) map.removeSource(sourceId)
        setLayerStatus((current) => {
          const next = { ...current }
          delete next[name]
          return next
        })
      }
    })
    if (map.getLayer('atlas-parcel-fill')) map.moveLayer('atlas-parcel-fill')
    if (map.getLayer('atlas-parcel-line')) map.moveLayer('atlas-parcel-line')
  }

  function toggleOverlay(name: string) {
    setActiveOverlays((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name])
  }

  function choosePlannerTool(name: PlannerName) {
    setPlannerTool(name)
    const overlays = PLANNER_ITEMS.find((item) => item.name === name)?.overlays ?? []
    setActiveOverlays((current) => [...new Set([...current, ...overlays])])
  }

  function openWorld() {
    setPlannerOpen(false)
    setWorldOpen(true)
  }

  return (
    <section className={`${compact ? 'atlas-map-shell compact-map' : 'atlas-map-shell'}${planningMode ? ' planning-map' : ''}`}>
      {!planningMode && worldOpen && <AtlasWorld property={property} parcel={parcel} parcelVerified={parcelVerified} onClose={() => setWorldOpen(false)} />}

      {!planningMode && (
        <div className="atlas-map-toolbar">
          <div className="basemap-switch" aria-label="Base map">
            <button className={worldOpen ? 'world-mode active' : 'world-mode'} onClick={openWorld}>World</button>
            {(['Aerial', 'Terrain', 'Topographic'] as BaseMapMode[]).map((mode) => (
              <button key={mode} className={!worldOpen && baseMap === mode ? 'active' : ''} onClick={() => { setWorldOpen(false); setBaseMap(mode) }}>{mode === 'Terrain' ? '3D Terrain' : mode}</button>
            ))}
          </div>
          <div className="overlay-switch" aria-label="Map overlays">
            {overlayNames.map((name) => (
              <button key={name} className={activeOverlays.includes(name) ? `active ${layerStatus[name] ?? ''}` : ''} onClick={() => toggleOverlay(name)} aria-pressed={activeOverlays.includes(name)}>
                {name}{layerStatus[name] === 'loading' ? ' ···' : layerStatus[name] === 'error' ? ' !' : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      {!planningMode && (
        <>
          <button className={plannerOpen ? 'site-planner-launch active' : 'site-planner-launch'} onClick={() => { setWorldOpen(false); setPlannerOpen((open) => !open) }} aria-expanded={plannerOpen}>
            <span>+</span>{plannerOpen ? 'Close planner' : 'Plan this property'}
          </button>
          {plannerOpen && (
            <aside className="site-planner-panel" aria-label="Concept site planner">
              <div className="planner-title"><div><span>CONCEPT PLANNER</span><strong>What goes where?</strong></div><b>{placements.length}</b></div>
              <div className="planner-item-grid">
                {PLANNER_ITEMS.slice(0, 6).map((item) => (
                  <button key={item.name} className={plannerTool === item.name ? 'active' : ''} onClick={() => choosePlannerTool(item.name)}><span>{item.icon}</span><strong>{item.name}</strong></button>
                ))}
              </div>
              <p className="planner-hint"><i />Tap inside the parcel to place · drag to move</p>
              <div className="planner-actions"><button disabled={!placements.length} onClick={() => setPlacements((current) => current.slice(0, -1))}>Undo</button><button disabled={!placements.length} onClick={() => setPlacements([])}>Clear all</button></div>
              <small>Concept only · verify survey, setbacks, septic and permits</small>
            </aside>
          )}
        </>
      )}

      {planningMode && (
        <div className="planning-map-hud">
          <div><span>PLACING</span><strong>{plannerTool}</strong><small>{parcelVerified ? 'Tap inside parcel · drag to move' : 'Parcel verification required'}</small></div>
          <div className="planning-map-actions"><button disabled={!placements.length} onClick={() => setPlacements((current) => current.slice(0, -1))}>Undo</button><button disabled={!placements.length} onClick={() => setPlacements([])}>Clear</button></div>
        </div>
      )}

      {planningMode && plannerMessage && <div className="planning-map-message" role="status">{plannerMessage}</div>}

      <div ref={containerRef} className="atlas-map-canvas" />

      {!planningMode && (
        <>
          <div className="atlas-map-foot">
            <div><span className="mini-label">MAP VIEW</span><strong>{worldOpen ? 'ATLAS World' : baseMap === 'Terrain' ? '3D Terrain' : baseMap}{!worldOpen && activeOverlays.length ? ` + ${activeOverlays.join(' + ')}` : ''}</strong><small>{worldOpen ? 'Interactive parcel world · drag to orbit' : mapStatus}{placements.length ? ` · ${placements.length} idea${placements.length === 1 ? '' : 's'} placed` : ''}</small></div>
            <span className={parcelVerified ? 'map-proof verified' : 'map-proof'}>{parcelVerified ? 'Parcel verified' : 'Address located'}</span>
          </div>
          {activeOverlays.length > 0 && !worldOpen && <div className="active-layer-legend"><strong>Layer status</strong>{activeOverlays.map((name) => <span key={name} className={layerStatus[name] ?? 'loading'}><i />{name}: {layerStatus[name] === 'visible' ? 'on map' : layerStatus[name] === 'error' ? 'unavailable' : 'loading'}</span>)}</div>}
        </>
      )}
    </section>
  )
}
