import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl } from 'maplibre-gl'
import type { GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { resolveCountyParcel, resolveOhioAddress } from './services/ohioProperty'
import type { LocatedProperty, ParcelFeature } from './services/ohioProperty'

const reportNav = ['Overview', 'Home & Value', 'Land & Maps', 'Rural Potential', 'Risks', 'Costs']
const ruralUses = [
  ['🐓', 'Poultry'], ['🐐', 'Goats'], ['🐎', 'Horses'], ['🐄', 'Cattle'],
  ['🥕', 'Market garden'], ['🌳', 'Orchard'], ['🏡', 'Homestead'], ['🚜', 'Hobby farm'],
]

const aerialStyle = {
  version: 8 as const,
  sources: {
    'esri-world-imagery': {
      type: 'raster' as const,
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: 'Imagery © Esri and contributors',
      maxzoom: 20,
    },
  },
  layers: [{ id: 'aerial', type: 'raster' as const, source: 'esri-world-imagery' }],
}

function money(value: unknown) {
  const number = Number(value)
  if (!Number.isFinite(number) || number === 0) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(number)
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

function extendBounds(bounds: LngLatBounds, coordinates: unknown) {
  if (!Array.isArray(coordinates)) return
  if (coordinates.length >= 2 && typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
    bounds.extend([coordinates[0], coordinates[1]])
    return
  }
  coordinates.forEach((coordinate) => extendBounds(bounds, coordinate))
}

function App() {
  const [address, setAddress] = useState('')
  const [locatedProperty, setLocatedProperty] = useState<LocatedProperty | null>(null)
  const [parcel, setParcel] = useState<ParcelFeature | null>(null)
  const [parcelProvider, setParcelProvider] = useState<string | null>(null)
  const [searchStatus, setSearchStatus] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [activeSection, setActiveSection] = useState('Overview')
  const mapContainer = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const hasProperty = Boolean(locatedProperty)
  const mapMode = hasProperty ? 'report' : 'landing'

  useEffect(() => {
    if (!mapContainer.current) return
    const map = new MapLibreMap({
      container: mapContainer.current,
      style: aerialStyle,
      center: locatedProperty ? [locatedProperty.longitude, locatedProperty.latitude] : [-84.22, 39.13],
      zoom: locatedProperty ? 17 : 8.5,
      attributionControl: {},
      maxZoom: 20,
    })
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map

    if (locatedProperty) {
      markerRef.current = new Marker({ color: '#d95f82' })
        .setLngLat([locatedProperty.longitude, locatedProperty.latitude])
        .addTo(map)
    }

    return () => {
      markerRef.current?.remove()
      markerRef.current = null
      map.remove()
      mapRef.current = null
    }
  }, [mapMode])

  useEffect(() => {
    if (mapMode !== 'report' || !parcel) return
    const timeout = window.setTimeout(() => drawParcel(parcel), 50)
    return () => window.clearTimeout(timeout)
  }, [mapMode, parcel])

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
    const feature = { type: 'Feature', geometry: nextParcel.geometry, properties: nextParcel.properties } as any
    const addOrUpdate = () => {
      const existingSource = map.getSource('atlas-parcel') as GeoJSONSource | undefined
      if (existingSource) existingSource.setData(feature)
      else {
        map.addSource('atlas-parcel', { type: 'geojson', data: feature })
        map.addLayer({ id: 'atlas-parcel-fill', type: 'fill', source: 'atlas-parcel', paint: { 'fill-color': '#d95f82', 'fill-opacity': 0.16 } })
        map.addLayer({ id: 'atlas-parcel-line', type: 'line', source: 'atlas-parcel', paint: { 'line-color': '#d95f82', 'line-width': 4 } })
      }
      const bounds = new LngLatBounds()
      extendBounds(bounds, (nextParcel.geometry as { coordinates?: unknown }).coordinates)
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: { top: 54, right: 54, bottom: 54, left: 54 }, maxZoom: 18.5, duration: 900 })
    }
    if (map.isStyleLoaded()) addOrUpdate()
    else map.once('load', addOrUpdate)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = address.trim()
    if (!query) return
    setIsSearching(true)
    setActiveSection('Overview')
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
      if (!property.county) {
        setSearchStatus(`Address verified through ${property.source}. County parcel connection is still resolving.`)
        return
      }
      setSearchStatus(`Address verified in ${property.county} County. Checking parcel records…`)
      const parcelData = await resolveCountyParcel(property.county, property.longitude, property.latitude)
      if (!parcelData.supported) {
        setSearchStatus(`Address verified in ${property.county} County. Parcel data for this county is being connected.`)
        return
      }
      if (parcelData.error || !parcelData.parcel) {
        setSearchStatus(`Address verified in ${property.county} County. Parcel boundary requires verification.`)
        return
      }
      setParcel(parcelData.parcel)
      setParcelProvider(parcelData.provider ?? `${property.county} County GIS`)
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
    <main className={hasProperty ? 'site-shell report-mode' : 'site-shell'}>
      <nav className="nav-shell" aria-label="Primary navigation">
        <a className="brand" href="/" aria-label="ATLAS home"><span className="brand-mark">A</span><span><strong>ATLAS</strong><small>by Holton Homes</small></span></a>
        <span className="nav-status">Property Intelligence</span>
      </nav>

      {!hasProperty ? (
        <>
          <section className="hero landing-hero">
            <div className="hero-copy">
              <p className="eyebrow">PROPERTY INTELLIGENCE · OHIO</p>
              <h1>Understand the property beyond the listing.</h1>
              <p className="lede">Research the home, land, taxes, terrain, soil, water and rural potential in one clear property report.</p>
              <form className="search-card" onSubmit={handleSubmit}>
                <label htmlFor="property-address">Search a property</label>
                <div className="search-row"><input id="property-address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Enter any Ohio street address" autoComplete="street-address" /><button type="submit" disabled={isSearching}>{isSearching ? 'Analyzing…' : 'Analyze property'}</button></div>
                <p className={searchStatus ? 'search-status active' : 'search-status'}>{searchStatus || 'Enter an address and ATLAS will assemble the property record around it.'}</p>
              </form>
            </div>
            <aside className="preview-card map-card" aria-label="ATLAS property map"><div className="live-map" ref={mapContainer} /><div className="map-overlay-label">ATLAS AERIAL</div><div className="preview-content map-summary"><div><p className="mini-label">PROPERTY SEARCH</p><h2>Start with an address.</h2></div><span className="location-pill muted">Ready</span></div></aside>
          </section>
          <section className="landing-proof"><p className="eyebrow">ONE PROPERTY · ONE CLEAR REPORT</p><h2>Home, land, risks and possibilities — together.</h2><div className="landing-pill-row"><span>Verified records</span><span>Parcel & aerial</span><span>Land intelligence</span><span>Rural feasibility</span></div></section>
        </>
      ) : (
        <>
          <section className="property-shell">
            <div className="property-topbar"><form className="compact-search" onSubmit={handleSubmit}><input value={address} onChange={(event) => setAddress(event.target.value)} aria-label="Search another property" /><button type="submit" disabled={isSearching}>{isSearching ? 'Analyzing…' : 'Search'}</button></form><span className="report-status">{parcel ? 'Parcel verified' : 'Address verified'}</span></div>
            <header className="property-identity">
              <div><p className="eyebrow">ATLAS PROPERTY REPORT</p><h1>{locatedProperty?.address}</h1><div className="identity-meta"><span className="evidence-badge verified">Verified address</span><span>{locatedProperty?.county ? `${locatedProperty.county} County` : 'Ohio'}</span><span>{locatedProperty?.source}</span></div></div>
              <div className="quick-facts"><div><span>Acres</span><strong>{acres ? acres.toFixed(2) : '—'}</strong></div><div><span>Home size</span><strong>{livingArea ? `${livingArea.toLocaleString()} sf` : '—'}</strong></div><div><span>Year built</span><strong>{String(yearBuilt ?? '—')}</strong></div><div><span>Appraised</span><strong>{money(appraised)}</strong></div></div>
            </header>
            <div className="property-hero-grid">
              <section className="report-map-card"><div className="live-map report-map" ref={mapContainer} /><div className="map-overlay-label">AERIAL · {parcel ? 'PARCEL VERIFIED' : 'ADDRESS LOCATED'}</div><div className="map-bottom-bar"><div><span className="mini-label">MAP STATUS</span><strong>{parcel ? 'Verified parcel boundary' : 'Parcel boundary awaiting county source'}</strong></div><span className={parcel ? 'location-pill verified-pill' : 'location-pill'}>{parcel ? 'Verified' : 'Located'}</span></div></section>
              <aside className="property-summary-card"><div className="summary-heading"><span>Property snapshot</span><small>{parcelProvider || 'Statewide address record'}</small></div><div className="summary-list"><div><span>Parcel ID</span><strong>{String(parcelId ?? 'Requires parcel record')}</strong></div><div><span>Zoning</span><strong>{String(zoning ?? 'Requires verification')}</strong></div><div><span>Address source</span><strong>{locatedProperty?.source}</strong></div><div><span>County</span><strong>{locatedProperty?.county ? `${locatedProperty.county} County` : 'Resolving'}</strong></div></div><div className="status-note"><span className="status-dot" />{searchStatus}</div></aside>
            </div>
          </section>

          <nav className="report-nav" aria-label="Property report sections">{reportNav.map((item) => <button key={item} className={activeSection === item ? 'active' : ''} onClick={() => setActiveSection(item)}>{item}</button>)}</nav>

          <section className="report-content">
            {activeSection === 'Overview' && <><div className="section-heading"><div><p className="eyebrow">OVERVIEW</p><h2>The property at a glance.</h2></div><p>Official records, calculated findings and items that still need local verification are kept separate.</p></div><div className="overview-grid"><article className="intel-card feature-card"><span className="card-kicker">THE HOME</span><h3>Home & value</h3><p>Property facts, value context and comparable sales belong here.</p><button onClick={() => setActiveSection('Home & Value')}>Open Home & Value →</button></article><article className="intel-card feature-card"><span className="card-kicker">THE LAND</span><h3>Parcel & land</h3><p>{acres ? `${acres.toFixed(2)} acres in the county record.` : 'Parcel acreage appears once the county boundary is verified.'}</p><button onClick={() => setActiveSection('Land & Maps')}>Open Land & Maps →</button></article><article className="intel-card feature-card"><span className="card-kicker">DUE DILIGENCE</span><h3>What needs attention?</h3><p>Zoning, flood, drainage, septic, access and other risks stay together.</p><button onClick={() => setActiveSection('Risks')}>Review Risks →</button></article></div><div className="rural-preview"><div className="section-heading compact"><div><p className="eyebrow">RURAL POTENTIAL</p><h2>What could work here?</h2></div><button className="text-button" onClick={() => setActiveSection('Rural Potential')}>See full analysis →</button></div><div className="use-grid refined">{ruralUses.map(([icon, label]) => <div className="use-card" key={label}><span>{icon}</span><strong>{label}</strong><small>Analysis pending</small></div>)}</div></div></>}
            {activeSection === 'Home & Value' && <ReportPlaceholder eyebrow="HOME & VALUE" title="The home, its value and the market around it." text="Verified building facts, ownership and transfer records, comparable sales, valuation ranges and the visual CMA will live here." />}
            {activeSection === 'Land & Maps' && <ReportPlaceholder eyebrow="LAND & MAPS" title="See the land, not just the listing." text="Aerial, parcel, terrain, topography, soils, water, flood and wetland layers belong together as one map experience." />}
            {activeSection === 'Rural Potential' && <ReportPlaceholder eyebrow="RURAL POTENTIAL" title="What could you realistically do here?" text="Poultry, goats, horses, cattle, gardens, orchards, pasture, barns and homestead uses will be evaluated against the property evidence." />}
            {activeSection === 'Risks' && <ReportPlaceholder eyebrow="RISKS & DUE DILIGENCE" title="What could become expensive or limiting?" text="Zoning, septic, drainage, wetlands, flood exposure, access, easements and other items requiring verification will be organized here." />}
            {activeSection === 'Costs' && <ReportPlaceholder eyebrow="COSTS" title="What will this property actually cost to carry?" text="Taxes, CAUV, financing, utilities and ongoing rural-property carrying costs will be brought into one clear view." />}
          </section>
        </>
      )}
    </main>
  )
}

function ReportPlaceholder({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return <div className="placeholder-section"><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{text}</p><div className="placeholder-grid"><div /><div /><div /></div></div>
}

export default App