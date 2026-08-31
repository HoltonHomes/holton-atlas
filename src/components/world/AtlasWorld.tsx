import { useEffect, useRef } from 'react'
import { LngLatBounds, Map as MapLibreMap, NavigationControl } from 'maplibre-gl'
import type { GeoJSONSource, StyleSpecification } from 'maplibre-gl'
import type { ParcelFeature, LocatedProperty } from '../../services/ohioProperty'
import './atlas-world.css'

function extendBounds(bounds: LngLatBounds, coordinates: unknown) {
  if (!Array.isArray(coordinates)) return
  if (coordinates.length >= 2 && typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
    bounds.extend([coordinates[0], coordinates[1]])
    return
  }
  coordinates.forEach((coordinate) => extendBounds(bounds, coordinate))
}

function worldStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      'world-aerial': {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        maxzoom: 20,
        attribution: 'Imagery © Esri and contributors',
      },
      'world-dem': {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 15,
        attribution: 'Elevation © Mapzen / AWS Terrain Tiles',
      },
    },
    layers: [
      { id: 'world-aerial-layer', type: 'raster', source: 'world-aerial' },
      {
        id: 'world-hillshade',
        type: 'hillshade',
        source: 'world-dem',
        paint: {
          'hillshade-exaggeration': 0.32,
          'hillshade-shadow-color': '#17243a',
          'hillshade-highlight-color': '#fff8ef',
          'hillshade-accent-color': '#d95f82',
        },
      },
    ],
  }
}

export default function AtlasWorld({
  property,
  parcel,
  parcelVerified,
  onClose,
}: {
  property: LocatedProperty
  parcel: ParcelFeature | null
  parcelVerified: boolean
  onClose: () => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const map = new MapLibreMap({
      container: containerRef.current,
      style: worldStyle(),
      center: [property.longitude, property.latitude],
      zoom: 17,
      pitch: 64,
      bearing: -24,
      maxPitch: 82,
      maxZoom: 20,
      attributionControl: {},
      dragRotate: true,
      pitchWithRotate: true,
    })

    map.addControl(new NavigationControl({ showCompass: true, visualizePitch: true }), 'bottom-right')

    map.on('load', () => {
      map.setTerrain({ source: 'world-dem', exaggeration: 1.45 })

      if (parcel) {
        const feature = {
          type: 'Feature',
          geometry: parcel.geometry,
          properties: parcel.properties,
        } as any

        map.addSource('world-parcel', { type: 'geojson', data: feature })
        map.addLayer({
          id: 'world-parcel-fill',
          type: 'fill',
          source: 'world-parcel',
          paint: {
            'fill-color': '#d95f82',
            'fill-opacity': 0.12,
          },
        })
        map.addLayer({
          id: 'world-parcel-glow',
          type: 'line',
          source: 'world-parcel',
          paint: {
            'line-color': '#fff8ef',
            'line-width': 7,
            'line-opacity': 0.48,
            'line-blur': 5,
          },
        })
        map.addLayer({
          id: 'world-parcel-line',
          type: 'line',
          source: 'world-parcel',
          paint: {
            'line-color': '#d95f82',
            'line-width': 4,
          },
        })

        const bounds = new LngLatBounds()
        extendBounds(bounds, (parcel.geometry as { coordinates?: unknown }).coordinates)
        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, { padding: 95, maxZoom: 18, duration: 0 })
          window.setTimeout(() => {
            map.easeTo({ pitch: 67, bearing: -28, zoom: Math.min(18.2, map.getZoom() + 0.25), duration: 1700 })
          }, 120)
        }
      }
    })

    return () => map.remove()
  }, [parcel, property.latitude, property.longitude])

  return (
    <div className="atlas-world">
      <div ref={containerRef} className="atlas-world-map" />

      <div className="atlas-world-vignette" />
      <header className="atlas-world-hud">
        <div className="atlas-world-title">
          <span>ATLAS WORLD</span>
          <strong>{property.address}</strong>
          <small>{parcelVerified ? 'Verified parcel · real aerial · 3D elevation' : 'Address-centered 3D terrain'} · visual analysis only</small>
        </div>
        <button type="button" onClick={onClose}>Return to map</button>
      </header>

      <div className="atlas-world-mode-card">
        <span>3D PROPERTY VIEW</span>
        <strong>Explore the actual land.</strong>
        <p>Drag to move · right-drag to rotate · scroll to zoom.</p>
      </div>

      <div className="atlas-world-footer">
        <span className={parcelVerified ? 'verified' : ''}>{parcelVerified ? 'Parcel verified' : 'Address located'}</span>
        <span>Terrain exaggerated 1.45× for readability</span>
      </div>
    </div>
  )
}
