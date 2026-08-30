import { FormEvent, useEffect, useRef, useState } from 'react'
import { Map as MapLibreMap, Marker, NavigationControl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

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

function App() {
  const [address, setAddress] = useState('')
  const [locatedProperty, setLocatedProperty] = useState<LocatedProperty | null>(null)
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
      attributionControl: true,
    })

    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map

    return () => {
      markerRef.current?.remove()
      map.remove()
      mapRef.current = null
    }
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = address.trim()
    if (!query) return

    setIsSearching(true)
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
      setSearchStatus('Address located. Parcel lookup is the next layer.')

      const map = mapRef.current
      if (map) {
        markerRef.current?.remove()
        markerRef.current = new Marker({ color: '#d95f82' })
          .setLngLat([property.longitude, property.latitude])
          .addTo(map)

        map.flyTo({
          center: [property.longitude, property.latitude],
          zoom: 16.2,
          essential: true,
        })
      }
    } catch {
      setLocatedProperty(null)
      setSearchStatus('ATLAS could not reach the address locator. Try again in a moment.')
    } finally {
      setIsSearching(false)
    }
  }

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
                {isSearching ? 'Locating…' : 'Analyze property'}
              </button>
            </div>
            <p className={searchStatus ? 'search-status active' : 'search-status'}>
              {searchStatus || 'ATLAS separates verified records, calculated findings and items that still require verification.'}
            </p>
          </form>
        </div>

        <aside className="preview-card map-card" aria-label="ATLAS property map">
          <div className="live-map" ref={mapContainer} />
          <div className="map-overlay-label">ATLAS PROPERTY MAP</div>
          <div className="preview-content map-summary">
            <div>
              <p className="mini-label">ADDRESS LOCATION</p>
              <h2>{locatedProperty ? locatedProperty.address : 'Search a property to begin.'}</h2>
            </div>
            {locatedProperty ? (
              <span className="location-pill">Located · parcel next</span>
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
