import { useEffect, useMemo, useRef, useState } from 'react'
import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl } from 'maplibre-gl'
import type { GeoJSONSource, StyleSpecification } from 'maplibre-gl'
import type { LocatedProperty, ParcelFeature } from '../services/ohioProperty'
import { INTELLIGENCE_OVERLAYS } from '../services/propertyIntelligence'

export type BaseMapMode = 'Aerial' | 'Terrain' | 'Topographic'

const PLANNER_ITEMS = [
  { name: 'Barn', icon: '🏠', color: '#cb5b79', overlays: ['Flood', 'Wetlands'] },
  { name: 'Garden', icon: '🥕', color: '#668c58', overlays: ['Soils', 'Water'] },
  { name: 'Coop', icon: '🐓', color: '#bb7335', overlays: ['Flood'] },
  { name: 'Pasture', icon: '🌾', color: '#739658', overlays: ['Soils', 'Water'] },
  { name: 'Drive', icon: '↗', color: '#52687b', overlays: ['Water'] },
  { name: 'Pond', icon: '≈', color: '#367e9c', overlays: ['Water', 'Wetlands'] },
] as const

type PlannerName = typeof PLANNER_ITEMS[number]['name']
type PlannerPlacement = { id: number; name: PlannerName; longitude: number; latitude: number }

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
    maxZoom: 16,
  },
}

function styleFor(mode: BaseMapMode): StyleSpecification {
  const base = BASEMAPS[mode]
  const style: StyleSpecification = {
    version: 8,
    sources: {
      'atlas-base': {
        type: 'raster',
        tiles: [base.tile],
        tileSize: 256,
        attribution: base.attribution,
        maxzoom: base.maxZoom,
      },
    },
    layers: [{ id: 'atlas-base-layer', type: 'raster', source: 'atlas-base' }],
  }
  if (mode === 'Terrain') {
    const demSource = { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium', tileSize: 256, maxzoom: 15, attribution: 'Elevation © Mapzen / AWS Terrain Tiles' }
    ;(style.sources as Record<string, any>)['atlas-terrain-dem'] = { ...demSource }
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

export default function PropertyMap({
  property,
  parcel,
  parcelVerified,
  compact = false,
}: {
  property: LocatedProperty
  parcel: ParcelFeature | null
  parcelVerified: boolean
  compact?: boolean
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const planningMarkersRef = useRef<Map<number, Marker>>(new Map())
  const [baseMap, setBaseMap] = useState<BaseMapMode>('Aerial')
  const [activeOverlays, setActiveOverlays] = useState<string[]>([])
  const [mapStatus, setMapStatus] = useState('Map ready')
  const [layerStatus, setLayerStatus] = useState<Record<string, 'loading' | 'visible' | 'error'>>({})
  const [plannerOpen, setPlannerOpen] = useState(false)
  const [plannerTool, setPlannerTool] = useState<PlannerName>('Barn')
  const [placements, setPlacements] = useState<PlannerPlacement[]>([])
  const baseMapRef = useRef<BaseMapMode>(baseMap)
  const plannerOpenRef = useRef(plannerOpen)
  const plannerToolRef = useRef<PlannerName>(plannerTool)
  baseMapRef.current = baseMap
  plannerOpenRef.current = plannerOpen
  plannerToolRef.current = plannerTool

  const overlayNames = useMemo(() => ['Soils', 'Water', 'Flood', 'Wetlands'], [])

  useEffect(() => {
    if (!containerRef.current) return
    const map = new MapLibreMap({
      container: containerRef.current,
      style: styleFor(baseMap),
      center: [property.longitude, property.latitude],
      zoom: 17,
      attributionControl: {},
      maxZoom: 20,
      maxPitch: 80,
    })
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map
    markerRef.current = new Marker({ color: '#d95f82' })
      .setLngLat([property.longitude, property.latitude])
      .addTo(map)

    map.on('load', () => {
      setMapStatus(`${baseMapRef.current} loaded`)
      drawParcel(map, parcel)
      syncOverlays(map, activeOverlays)
    })

    map.on('error', (event) => {
      const sourceId = (event as any).sourceId as string | undefined
      const failed = overlayNames.find((name) => sourceId === `${overlayId(name)}-source`)
      const status = Number((event as any).error?.status)
      if (failed) {
        if (status >= 400) setLayerStatus((current) => ({ ...current, [failed]: 'error' }))
        return
      }
      setMapStatus('A map layer could not load')
    })
    map.on('sourcedata', (event) => {
      const loaded = overlayNames.find((name) => event.sourceId === `${overlayId(name)}-source`)
      if (loaded) setLayerStatus((current) => ({ ...current, [loaded]: 'visible' }))
    })
    map.on('click', (event) => {
      if (!plannerOpenRef.current) return
      const tool = plannerToolRef.current
      setPlacements((current) => [...current, {
        id: Date.now() + current.length,
        name: tool,
        longitude: event.lngLat.lng,
        latitude: event.lngLat.lat,
      }])
    })

    return () => {
      markerRef.current?.remove()
      markerRef.current = null
      planningMarkersRef.current.forEach((marker) => marker.remove())
      planningMarkersRef.current.clear()
      map.remove()
      mapRef.current = null
    }
    // Map is intentionally initialized once per property.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property.latitude, property.longitude])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    setMapStatus(`Loading ${baseMap}…`)
    map.once('style.load', () => {
      if (baseMap === 'Terrain') {
        map.setTerrain({ source: 'atlas-terrain-dem', exaggeration: 1.55 })
      }
      drawParcel(map, parcel)
      syncOverlays(map, activeOverlays)
      setMapStatus(`${baseMap} loaded`)
      map.once('idle', () => {
        map.easeTo({ pitch: baseMap === 'Terrain' ? 62 : 0, bearing: baseMap === 'Terrain' ? -18 : 0, duration: 900 })
      })
    })
    map.setStyle(styleFor(baseMap))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseMap])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    drawParcel(map, parcel)
  }, [parcel])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    syncOverlays(map, activeOverlays)
  }, [activeOverlays])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const frame = window.requestAnimationFrame(() => {
      map.resize()
      drawParcel(map, parcel)
    })
    return () => window.cancelAnimationFrame(frame)
    // The same map moves between the compact overview and full land workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.getCanvas().style.cursor = plannerOpen ? 'crosshair' : ''
  }, [plannerOpen])

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
      element.className = 'atlas-plan-marker'
      element.style.setProperty('--plan-color', item.color)
      element.type = 'button'
      element.title = `${item.name} idea · drag to move`
      element.setAttribute('aria-label', `${item.name} idea; drag to move`)
      element.innerHTML = `<span>${item.icon}</span><strong>${item.name}</strong>`
      const marker = new Marker({ element, draggable: true, anchor: 'bottom' })
        .setLngLat([placement.longitude, placement.latitude])
        .addTo(map)
      marker.on('dragend', () => {
        const location = marker.getLngLat()
        setPlacements((current) => current.map((candidate) => candidate.id === placement.id
          ? { ...candidate, longitude: location.lng, latitude: location.lat }
          : candidate))
      })
      planningMarkersRef.current.set(placement.id, marker)
    })
  }, [placements])

  function drawParcel(map: MapLibreMap, nextParcel: ParcelFeature | null) {
    if (!nextParcel) return
    const feature = { type: 'Feature', geometry: nextParcel.geometry, properties: nextParcel.properties } as any
    const source = map.getSource('atlas-parcel') as GeoJSONSource | undefined
    if (source) source.setData(feature)
    else {
      map.addSource('atlas-parcel', { type: 'geojson', data: feature })
      map.addLayer({ id: 'atlas-parcel-fill', type: 'fill', source: 'atlas-parcel', paint: { 'fill-color': '#d95f82', 'fill-opacity': 0.12 } })
      map.addLayer({ id: 'atlas-parcel-line', type: 'line', source: 'atlas-parcel', paint: { 'line-color': '#d95f82', 'line-width': 4 } })
    }

    const bounds = new LngLatBounds()
    extendBounds(bounds, (nextParcel.geometry as { coordinates?: unknown }).coordinates)
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: compact ? 28 : 48, maxZoom: 18.5, duration: 650 })
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
        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, { type: 'raster', tiles: [definition.tile], tileSize: 256, minzoom: 6, maxzoom: 19 })
        }
        map.addLayer({ id, type: 'raster', source: sourceId, paint: { 'raster-opacity': definition.opacity, 'raster-fade-duration': 0 } })
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

  return (
    <section className={compact ? 'atlas-map-shell compact-map' : 'atlas-map-shell'}>
      <div className="atlas-map-toolbar">
        <div className="basemap-switch" aria-label="Base map">
          {(['Aerial', 'Terrain', 'Topographic'] as BaseMapMode[]).map((mode) => (
            <button key={mode} className={baseMap === mode ? 'active' : ''} onClick={() => setBaseMap(mode)}>{mode === 'Terrain' ? '3D Terrain' : mode}</button>
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
      <button className={plannerOpen ? 'site-planner-launch active' : 'site-planner-launch'} onClick={() => setPlannerOpen((open) => !open)} aria-expanded={plannerOpen}>
        <span>+</span>{plannerOpen ? 'Close planner' : 'Plan this property'}
      </button>
      {plannerOpen && (
        <aside className="site-planner-panel" aria-label="Concept site planner">
          <div className="planner-title"><div><span>CONCEPT PLANNER</span><strong>What goes where?</strong></div><b>{placements.length}</b></div>
          <div className="planner-item-grid">
            {PLANNER_ITEMS.map((item) => (
              <button key={item.name} className={plannerTool === item.name ? 'active' : ''} onClick={() => choosePlannerTool(item.name)}>
                <span>{item.icon}</span><strong>{item.name}</strong>
              </button>
            ))}
          </div>
          <p className="planner-hint"><i />Tap the map to place · drag to move</p>
          <div className="planner-actions">
            <button disabled={!placements.length} onClick={() => setPlacements((current) => current.slice(0, -1))}>Undo</button>
            <button disabled={!placements.length} onClick={() => setPlacements([])}>Clear all</button>
          </div>
          <small>Concept only · verify survey, setbacks, septic and permits</small>
        </aside>
      )}
      <div ref={containerRef} className="atlas-map-canvas" />
      <div className="atlas-map-foot">
        <div><span className="mini-label">MAP VIEW</span><strong>{baseMap === 'Terrain' ? '3D Terrain' : baseMap}{activeOverlays.length ? ` + ${activeOverlays.join(' + ')}` : ''}</strong><small>{mapStatus}{placements.length ? ` · ${placements.length} idea${placements.length === 1 ? '' : 's'} placed` : ''}</small></div>
        <span className={parcelVerified ? 'map-proof verified' : 'map-proof'}>{parcelVerified ? 'Parcel verified' : 'Address located'}</span>
      </div>
      {activeOverlays.length > 0 && <div className="active-layer-legend"><strong>Layer status</strong>{activeOverlays.map((name) => <span key={name} className={layerStatus[name] ?? 'loading'}><i />{name}: {layerStatus[name] === 'visible' ? 'on map' : layerStatus[name] === 'error' ? 'unavailable' : 'loading'}</span>)}</div>}
    </section>
  )
}
