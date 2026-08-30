import { useEffect, useMemo, useRef, useState } from 'react'
import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl } from 'maplibre-gl'
import type { GeoJSONSource, StyleSpecification } from 'maplibre-gl'
import type { LocatedProperty, ParcelFeature } from '../services/ohioProperty'
import { INTELLIGENCE_OVERLAYS } from '../services/propertyIntelligence'

export type BaseMapMode = 'Aerial' | 'Terrain' | 'Topographic'

const BASEMAPS: Record<BaseMapMode, { tile: string; attribution: string }> = {
  Aerial: {
    tile: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagery © Esri and contributors',
  },
  Terrain: {
    tile: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Terrain © Esri and contributors',
  },
  Topographic: {
    tile: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Topographic map © Esri and contributors',
  },
}

function styleFor(mode: BaseMapMode): StyleSpecification {
  const base = BASEMAPS[mode]
  return {
    version: 8,
    sources: {
      'atlas-base': {
        type: 'raster',
        tiles: [base.tile],
        tileSize: 256,
        attribution: base.attribution,
        maxzoom: 20,
      },
    },
    layers: [{ id: 'atlas-base-layer', type: 'raster', source: 'atlas-base' }],
  }
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
  const [baseMap, setBaseMap] = useState<BaseMapMode>('Aerial')
  const [activeOverlays, setActiveOverlays] = useState<string[]>([])
  const [mapStatus, setMapStatus] = useState('Map ready')

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
    })
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map
    markerRef.current = new Marker({ color: '#d95f82' })
      .setLngLat([property.longitude, property.latitude])
      .addTo(map)

    map.on('load', () => {
      setMapStatus(`${baseMap} loaded`)
      drawParcel(map, parcel)
      syncOverlays(map, activeOverlays)
    })

    map.on('error', () => setMapStatus('A map layer could not load'))

    return () => {
      markerRef.current?.remove()
      markerRef.current = null
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
    map.setStyle(styleFor(baseMap))
    map.once('style.load', () => {
      drawParcel(map, parcel)
      syncOverlays(map, activeOverlays)
      setMapStatus(`${baseMap} loaded`)
    })
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
        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, { type: 'raster', tiles: [definition.tile], tileSize: 256 })
        }
        map.addLayer({ id, type: 'raster', source: sourceId, paint: { 'raster-opacity': Math.max(definition.opacity, 0.68) } })
      }

      if (!shouldShow && exists) {
        map.removeLayer(id)
        if (map.getSource(sourceId)) map.removeSource(sourceId)
      }
    })

    if (map.getLayer('atlas-parcel-fill')) map.moveLayer('atlas-parcel-fill')
    if (map.getLayer('atlas-parcel-line')) map.moveLayer('atlas-parcel-line')
  }

  function toggleOverlay(name: string) {
    setActiveOverlays((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name])
  }

  return (
    <section className={compact ? 'atlas-map-shell compact-map' : 'atlas-map-shell'}>
      <div className="atlas-map-toolbar">
        <div className="basemap-switch" aria-label="Base map">
          {(['Aerial', 'Terrain', 'Topographic'] as BaseMapMode[]).map((mode) => (
            <button key={mode} className={baseMap === mode ? 'active' : ''} onClick={() => setBaseMap(mode)}>{mode}</button>
          ))}
        </div>
        <div className="overlay-switch" aria-label="Map overlays">
          {overlayNames.map((name) => (
            <button key={name} className={activeOverlays.includes(name) ? 'active' : ''} onClick={() => toggleOverlay(name)}>{name}</button>
          ))}
        </div>
      </div>
      <div ref={containerRef} className="atlas-map-canvas" />
      <div className="atlas-map-foot">
        <div><span className="mini-label">MAP VIEW</span><strong>{baseMap}{activeOverlays.length ? ` + ${activeOverlays.join(' + ')}` : ''}</strong><small>{mapStatus}</small></div>
        <span className={parcelVerified ? 'map-proof verified' : 'map-proof'}>{parcelVerified ? 'Parcel verified' : 'Address located'}</span>
      </div>
      {activeOverlays.length > 0 && <div className="active-layer-legend"><strong>Visible layers</strong>{activeOverlays.map((name) => <span key={name}>{name}</span>)}</div>}
    </section>
  )
}
