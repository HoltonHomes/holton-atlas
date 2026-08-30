import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Map as MapLibreMap, Marker, NavigationControl } from 'maplibre-gl'
import type { GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { findClermontParcel } from './services/clermontParcels'
import type { ClermontParcel } from './services/clermontParcels'

const capabilities = [
  'Value & CMA',
  'Taxes & CAUV',
  'Parcel & Aerial',
  'Terrain & Topography',
  'Soils & Water',
  'Rural Potential',
]

type LocatedProperty = {
  address: string
  latitude: number
  longitude: number
}

function money(value?: number | null) {
  if (!value) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

function App() {
  const [address, setAddress] = useState('')
  const [locatedProperty, setLocatedProperty] = useState<LocatedProperty | null>(null)
  const [parcel, setParcel] = useState<ClermontParcel | null>(null)
  const [searchStatus, setSearchStatus] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const mapContainer = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markerRef = useRef<Marker | null>(null)

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return

    const map = new MapLibreMap({
      container: mapContainer.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [-84.22, 39.13],
      zoom: 8.5,
      attributionControl: {},
    })

    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map

    return () => {
      markerRef.current?.remove()
      map.remove()
      mapRef.current = null
    }
  }, [])

  function drawParcel(nextParcel: ClermontParcel) {
    const map = mapRef.current
    if (!map) return

    const feature = {
      type: 'Feature',
      geometry: nextParcel.geometry,
      properties: nextParcel.properties,
    } as any

    const existingSource = map.getSource('atlas-parcel') as GeoJSONSource | undefined
    if (existingSource) {
      existingSource.setData(feature)
      return
    }

    map.addSource('atlas-parcel', {
      type: 'geojson',
      data: feature,
    })

    map.addLayer({
      id: 'atlas-parcel-fill',
      type: 'fill',
      source: 'atlas-parcel',
      paint: {
        'fill-color': '#d95f82',
        'fill-opacity': 0.14,
      },
    })

    map.addLayer({
      id: 'atlas-parcel-line',
      type: 'line',
      source: 'atlas-parcel',
      paint: {
        'line-color': '#d95f82',
        'line-width': 4,
      },
    })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = address.trim()
    if (!query) return

    setIsSearching(true)
    setParcel(null)
    setSearchStatus('Locating property…')

    try {
      const url = new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress')
      url.searchParams.set('address', query)
      url.searchParams.set('benchmark', 'Public_AR_Current')
      url.searchParams.set('format', 'json')

      const response = await fetch(url)
      if (!response.ok) throw new Error('Address service unavailable')

      const data = await response.json() as {
        result?: {
          addressMatches?: Array<{
            matchedAddress: string
            coordinates: { x: number; y: number }
          }>
        }
      }

      const match = data.result?.addressMatches?.[0]
      if (!match) {
        setLocatedProperty(null)
        setSearchStatus('No confident address match found. Try including city, state and ZIP.')
        return
      }

      const property = {
        address: match.matchedAddress,
        longitude: match.coordinates.x,
        latitude: match.coordinates.y,
      }

      setLocatedProperty(property)

      const map = mapRef.current
      if (map) {
        markerRef.current?.remove()
        markerRef.current = new Marker({ color: '#1c2b45' })
          .setLngLat([property.longitude, property.latitude])
          .addTo(map)

        map.flyTo({
          center: [property.longitude, property.latitude],
          zoom: 17,
          essential: true,
        })
      }

      setSearchStatus('Address located. Checking county parcel records…')

      try {
        const matchedParcel = await findClermontParcel(property.longitude, property.latitude)
        if (matchedParcel) {
          setParcel(matchedParcel)
          drawParcel(matchedParcel)
          setSearchStatus('Verified parcel found in Clermont County public GIS records.')
        } else {
          setSearchStatus('Address located. Verified parcel coverage for this county is not connected yet.')
        }
      } catch {
        setSearchStatus('Address located. County parcel service could not be reached right now.')
      }
    } catch {
      setLocatedProperty(null)
      setParcel(null)
      setSearchStatus('ATLAS could not reach the address locator. Try again in a moment.')
    } finally {
      setIsSearching(false)
    }
  }

  const parcelId = parcel?.properties.ParcelNumber || parcel?.properties.PRCLID || parcel?.properties.PIN

  return (
    <main className="site-shell">
      <nav className="nav-shell" aria-label="Primary navigation">
        <a className="brand" href="/" aria-label="ATLAS home">
          <span className="brand-mark">A</span>
          <span>
            <strong>ATLAS</strong>
            <small>by Holton Homes</small>
          </span>
        </a>
        <span className="nav-status">Property Intelligence</span>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">PROPERTY INTELLIGENCE · GREATER CINCINNATI</p>
          <h1>Understand the property beyond the listing.</h1>
          <p className="lede">
            Research the home, land, taxes, terrain, soil, water and rural potential in one clear property report.
          </p>

          <form className="search-card" onSubmit={handleSubmit}>
            <label htmlFor="property-address">Search a property</label>
            <div className="search-row">
              <input
                id="property-address"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="1234 Country Rd, Williamsburg, OH 45176"
                autoComplete="street-address"
              />
              <button type="submit" disabled={isSearching}>
                {isSearching ? 'Analyzing…' : 'Analyze property'}
              </button>
            </div>
            <p className={searchStatus ? 'search-status active' : 'search-status'}>
              {searchStatus || 'ATLAS separates verified records, calculated findings and items that still require verification.'}
            </p>
          </form>

          {parcel && (
            <section className="parcel-facts" aria-label="Verified parcel facts">
              <div className="fact-heading">
                <span className="evidence-badge verified">Verified</span>
                <p>Clermont County public GIS</p>
              </div>
              <div className="facts-grid">
                <div><span>Parcel</span><strong>{parcelId || '—'}</strong></div>
                <div><span>Acres</span><strong>{parcel.properties.ACRES?.toFixed(2) || '—'}</strong></div>
                <div><span>Appraised value</span><strong>{money(parcel.properties.APRTOT)}</strong></div>
                <div><span>Living area</span><strong>{parcel.properties.SQ_FT ? `${parcel.properties.SQ_FT.toLocaleString()} sq ft` : '—'}</strong></div>
                <div><span>Year built</span><strong>{parcel.properties.YRBLT || '—'}</strong></div>
                <div><span>Zoning</span><strong>{parcel.properties.ZoneType || 'Requires verification'}</strong></div>
              </div>
            </section>
          )}
        </div>

        <aside className="preview-card map-card" aria-label="ATLAS property map">
          <div className="live-map" ref={mapContainer} />
          <div className="map-overlay-label">ATLAS PROPERTY MAP</div>
          <div className="preview-content map-summary">
            <div>
              <p className="mini-label">{parcel ? 'VERIFIED PARCEL' : 'ADDRESS LOCATION'}</p>
              <h2>{locatedProperty ? locatedProperty.address : 'Search a property to begin.'}</h2>
            </div>
            {parcel ? (
              <span className="location-pill verified-pill">Verified parcel</span>
            ) : locatedProperty ? (
              <span className="location-pill">Located</span>
            ) : (
              <span className="location-pill muted">Ready</span>
            )}
          </div>
        </aside>
      </section>

      <section className="capability-strip" aria-label="ATLAS capabilities">
        {capabilities.map((capability) => (
          <span key={capability}>{capability}</span>
        ))}
      </section>

      <section className="principle">
        <div>
          <p className="eyebrow">BUILT FOR RURAL DECISIONS</p>
          <h2>Not just “what is this property?” — “what could I actually do here?”</h2>
        </div>
        <div className="use-grid">
          {['🐓 Poultry', '🐐 Goats', '🐎 Horses', '🐄 Cattle', '🥕 Market garden', '🌳 Orchard', '🏡 Homestead', '🚜 Hobby farm'].map((use) => (
            <div className="use-card" key={use}>{use}</div>
          ))}
        </div>
      </section>
    </main>
  )
}

export default App
