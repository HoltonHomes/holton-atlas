import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Map as MapLibreMap, Marker, NavigationControl } from 'maplibre-gl'
import type { GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { resolveCountyParcel, resolveOhioAddress } from './services/ohioProperty'
import type { LocatedProperty, ParcelFeature } from './services/ohioProperty'

const capabilities = [
  'Value & CMA',
  'Taxes & CAUV',
  'Parcel & Aerial',
  'Terrain & Topography',
  'Soils & Water',
  'Rural Potential',
]

function money(value: unknown) {
  const number = Number(value)
  if (!Number.isFinite(number) || number === 0) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(number)
}

function firstValue(properties: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = properties[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return null
}

function numericValue(properties: Record<string, unknown>, keys: string[]) {
  const value = firstValue(properties, keys)
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function App() {
  const [address, setAddress] = useState('')
  const [locatedProperty, setLocatedProperty] = useState<LocatedProperty | null>(null)
  const [parcel, setParcel] = useState<ParcelFeature | null>(null)
  const [parcelProvider, setParcelProvider] = useState<string | null>(null)
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

  function clearParcel() {
    setParcel(null)
    setParcelProvider(null)
    const map = mapRef.current
    if (!map) return
    if (map.getLayer('atlas-parcel-line')) map.removeLayer('atlas-parcel-line')
    if (map.getLayer('atlas-parcel-fill')) map.removeLayer('atlas-parcel-fill')
    if (map.getSource('atlas-parcel')) map.removeSource('atlas-parcel')
  }

  function drawParcel(nextParcel: ParcelFeature) {
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

    map.addSource('atlas-parcel', { type: 'geojson', data: feature })
    map.addLayer({
      id: 'atlas-parcel-fill',
      type: 'fill',
      source: 'atlas-parcel',
      paint: { 'fill-color': '#d95f82', 'fill-opacity': 0.14 },
    })
    map.addLayer({
      id: 'atlas-parcel-line',
      type: 'line',
      source: 'atlas-parcel',
      paint: { 'line-color': '#d95f82', 'line-width': 4 },
    })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = address.trim()
    if (!query) return

    setIsSearching(true)
    clearParcel()
    setSearchStatus('Locating property with statewide Ohio records…')

    try {
      const property = await resolveOhioAddress(query)

      if (!property) {
        setLocatedProperty(null)
        setSearchStatus('No confident Ohio address match found. Try the full street address, city and ZIP.')
        return
      }

      setLocatedProperty(property)

      const map = mapRef.current
      if (map) {
        markerRef.current?.remove()
        markerRef.current = new Marker({ color: '#1c2b45' })
          .setLngLat([property.longitude, property.latitude])
          .addTo(map)
        map.flyTo({ center: [property.longitude, property.latitude], zoom: 17, essential: true })
      }

      if (!property.county) {
        setSearchStatus(`Address matched through ${property.source}. County could not be resolved automatically yet.`)
        return
      }

      setSearchStatus(`Address verified in ${property.county} County. Checking parcel records…`)

      const parcelData = await resolveCountyParcel(property.county, property.longitude, property.latitude)

      if (!parcelData.supported) {
        setSearchStatus(`Address verified in ${property.county} County. ATLAS recognized the county; its live parcel provider is the next data connection.`)
        return
      }

      if (parcelData.error) {
        setSearchStatus(`Address verified in ${property.county} County. ${parcelData.provider ?? 'County GIS'} could not return a parcel right now.`)
        return
      }

      if (!parcelData.parcel) {
        setSearchStatus(`Address verified in ${property.county} County, but no parcel polygon intersected the address point.`)
        return
      }

      setParcel(parcelData.parcel)
      setParcelProvider(parcelData.provider ?? `${property.county} County GIS`)
      drawParcel(parcelData.parcel)
      setSearchStatus(`Verified parcel found in ${parcelData.provider ?? `${property.county} County GIS`} records.`)
    } catch (error) {
      setLocatedProperty(null)
      clearParcel()
      setSearchStatus(`ATLAS search error: ${error instanceof Error ? error.message : 'Unable to resolve property'}`)
    } finally {
      setIsSearching(false)
    }
  }

  const properties = parcel?.properties ?? {}
  const parcelId = firstValue(properties, ['ParcelNumber', 'PRCLID', 'PIN', 'PARCEL_ID', 'PARCELID', 'PARCEL', 'Parcel'])
  const acres = numericValue(properties, ['ACRES', 'Acres', 'ACREAGE', 'Acreage', 'CALCACRES'])
  const appraised = firstValue(properties, ['APRTOT', 'APPRAISED', 'APPRAISED_VALUE', 'MARKET_VALUE', 'TOTAL_VALUE'])
  const livingArea = numericValue(properties, ['SQ_FT', 'LIVING_AREA', 'LIVAREA', 'SQUARE_FEET', 'SF'])
  const yearBuilt = firstValue(properties, ['YRBLT', 'YEAR_BUILT', 'YEARBUILT'])
  const zoning = firstValue(properties, ['ZoneType', 'ZONING', 'Zoning', 'ZONE'])

  return (
    <main className="site-shell">
      <nav className="nav-shell" aria-label="Primary navigation">
        <a className="brand" href="/" aria-label="ATLAS home">
          <span className="brand-mark">A</span>
          <span><strong>ATLAS</strong><small>by Holton Homes</small></span>
        </a>
        <span className="nav-status">Property Intelligence</span>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">PROPERTY INTELLIGENCE · OHIO</p>
          <h1>Understand the property beyond the listing.</h1>
          <p className="lede">Research the home, land, taxes, terrain, soil, water and rural potential in one clear property report.</p>

          <form className="search-card" onSubmit={handleSubmit}>
            <label htmlFor="property-address">Search a property</label>
            <div className="search-row">
              <input
                id="property-address"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="Enter any Ohio street address"
                autoComplete="street-address"
              />
              <button type="submit" disabled={isSearching}>{isSearching ? 'Analyzing…' : 'Analyze property'}</button>
            </div>
            <p className={searchStatus ? 'search-status active' : 'search-status'}>
              {searchStatus || 'ATLAS uses statewide Ohio address records, then routes to the correct county data sources.'}
            </p>
          </form>

          {locatedProperty && (
            <div className="address-proof">
              <span className="evidence-badge verified">Verified address</span>
              <span>{locatedProperty.county ? `${locatedProperty.county} County` : 'Ohio'}</span>
              <span>{locatedProperty.source}</span>
            </div>
          )}

          {parcel && (
            <section className="parcel-facts" aria-label="Verified parcel facts">
              <div className="fact-heading">
                <span className="evidence-badge verified">Verified parcel</span>
                <p>{parcelProvider}</p>
              </div>
              <div className="facts-grid">
                <div><span>Parcel</span><strong>{String(parcelId ?? '—')}</strong></div>
                <div><span>Acres</span><strong>{acres ? acres.toFixed(2) : '—'}</strong></div>
                <div><span>Appraised value</span><strong>{money(appraised)}</strong></div>
                <div><span>Living area</span><strong>{livingArea ? `${livingArea.toLocaleString()} sq ft` : '—'}</strong></div>
                <div><span>Year built</span><strong>{String(yearBuilt ?? '—')}</strong></div>
                <div><span>Zoning</span><strong>{String(zoning ?? 'Requires verification')}</strong></div>
              </div>
            </section>
          )}
        </div>

        <aside className="preview-card map-card" aria-label="ATLAS property map">
          <div className="live-map" ref={mapContainer} />
          <div className="map-overlay-label">ATLAS PROPERTY MAP</div>
          <div className="preview-content map-summary">
            <div>
              <p className="mini-label">{parcel ? 'VERIFIED PARCEL' : locatedProperty ? 'VERIFIED ADDRESS' : 'OHIO PROPERTY SEARCH'}</p>
              <h2>{locatedProperty ? locatedProperty.address : 'Search a property to begin.'}</h2>
            </div>
            {parcel ? (
              <span className="location-pill verified-pill">Verified parcel</span>
            ) : locatedProperty ? (
              <span className="location-pill">{locatedProperty.county ? `${locatedProperty.county} County` : 'Located'}</span>
            ) : (
              <span className="location-pill muted">Ready</span>
            )}
          </div>
        </aside>
      </section>

      <section className="capability-strip" aria-label="ATLAS capabilities">
        {capabilities.map((capability) => <span key={capability}>{capability}</span>)}
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
