import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl } from 'maplibre-gl'
import type { GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { resolveCountyParcel, resolveOhioAddress } from './services/ohioProperty'
import type { LocatedProperty, ParcelFeature } from './services/ohioProperty'
import { getPropertyIntelligence, INTELLIGENCE_OVERLAYS } from './services/propertyIntelligence'
import type { PropertyIntelligence } from './services/propertyIntelligence'
import { getCountyPropertyRecord } from './services/countyRecords'
import type { CountyPropertyRecord } from './services/countyRecords'
import {
  CostsSection,
  HomeValueSection,
  IntelligenceStrip,
  LandMapsSection,
  RisksSection,
  RuralPotentialSection,
} from './components/IntelligenceReport'

const reportNav = ['Overview', 'Home & Value', 'Land & Maps', 'Rural Potential', 'Risks', 'Costs']

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

function dateLabel(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.split(' ')[0]
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
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

function layerId(name: string) {
  return `atlas-intel-${name.toLowerCase().replaceAll(' ', '-')}`
}

function App() {
  const [address, setAddress] = useState('')
  const [locatedProperty, setLocatedProperty] = useState<LocatedProperty | null>(null)
  const [parcel, setParcel] = useState<ParcelFeature | null>(null)
  const [parcelProvider, setParcelProvider] = useState<string | null>(null)
  const [countyRecord, setCountyRecord] = useState<CountyPropertyRecord | null>(null)
  const [countyRecordLoading, setCountyRecordLoading] = useState(false)
  const [intelligence, setIntelligence] = useState<PropertyIntelligence | null>(null)
  const [intelligenceLoading, setIntelligenceLoading] = useState(false)
  const [activeLayers, setActiveLayers] = useState<string[]>([])
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

  useEffect(() => {
    const map = mapRef.current
    if (!map || mapMode !== 'report') return

    const syncLayers = () => {
      Object.entries(INTELLIGENCE_OVERLAYS).forEach(([name, definition]) => {
        const id = layerId(name)
        const sourceId = `${id}-source`
        const shouldShow = activeLayers.includes(name)
        const hasLayer = Boolean(map.getLayer(id))

        if (shouldShow && !hasLayer) {
          if (!map.getSource(sourceId)) {
            map.addSource(sourceId, {
              type: 'raster',
              tiles: [definition.tile],
              tileSize: 256,
            })
          }
          map.addLayer({
            id,
            type: 'raster',
            source: sourceId,
            paint: { 'raster-opacity': definition.opacity },
          })
        }

        if (!shouldShow && hasLayer) {
          map.removeLayer(id)
          if (map.getSource(sourceId)) map.removeSource(sourceId)
        }
      })

      if (map.getLayer('atlas-parcel-fill')) map.moveLayer('atlas-parcel-fill')
      if (map.getLayer('atlas-parcel-line')) map.moveLayer('atlas-parcel-line')
    }

    if (map.isStyleLoaded()) syncLayers()
    else map.once('load', syncLayers)
  }, [activeLayers, mapMode])

  function toggleLayer(name: string) {
    setActiveLayers((current) => current.includes(name) ? current.filter((layer) => layer !== name) : [...current, name])
  }

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
    setIntelligenceLoading(true)
    setCountyRecordLoading(true)
    setIntelligence(null)
    setCountyRecord(null)
    setActiveLayers([])
    setActiveSection('Overview')
    clearParcel()
    setSearchStatus('Locating property and assembling official records + statewide intelligence…')

    try {
      const property = await resolveOhioAddress(query)
      if (!property) {
        setLocatedProperty(null)
        setIntelligenceLoading(false)
        setCountyRecordLoading(false)
        setSearchStatus('No confident Ohio address match found. Try the full street address, city and ZIP.')
        return
      }

      setLocatedProperty(property)
      setSearchStatus(`Address verified${property.county ? ` in ${property.county} County` : ''}. Pulling county facts, soils, flood, wetlands, terrain and parcel records…`)

      const [nextIntelligence, parcelData, nextCountyRecord] = await Promise.all([
        getPropertyIntelligence(property.longitude, property.latitude),
        property.county
          ? resolveCountyParcel(property.county, property.longitude, property.latitude)
          : Promise.resolve(null),
        getCountyPropertyRecord(property.county, property.address).catch(() => null),
      ])

      setIntelligence(nextIntelligence)
      setIntelligenceLoading(false)
      setCountyRecord(nextCountyRecord)
      setCountyRecordLoading(false)

      if (parcelData?.supported && parcelData.parcel && !parcelData.error) {
        setParcel(parcelData.parcel)
        setParcelProvider(parcelData.provider ?? `${property.county} County GIS`)
      }

      if (nextCountyRecord && parcelData?.parcel) {
        setSearchStatus(`Official ${nextCountyRecord.source} property facts, verified parcel geometry and statewide land intelligence loaded.`)
      } else if (nextCountyRecord) {
        setSearchStatus(`Official ${nextCountyRecord.source} property facts + statewide land intelligence loaded. Parcel boundary is the remaining county GIS connection.`)
      } else if (parcelData?.parcel) {
        setSearchStatus(`Verified parcel + statewide land intelligence loaded. Detailed county property facts are the remaining local adapter.`)
      } else if (property.county) {
        setSearchStatus(`Statewide land intelligence loaded for ${property.county} County. Detailed county parcel/property integration is still being connected.`)
      } else {
        setSearchStatus('Statewide land intelligence loaded. County property record still requires resolution.')
      }
    } catch (error) {
      setLocatedProperty(null)
      setIntelligence(null)
      setCountyRecord(null)
      setIntelligenceLoading(false)
      setCountyRecordLoading(false)
      clearParcel()
      setSearchStatus(`ATLAS search error: ${error instanceof Error ? error.message : 'Unable to resolve property'}`)
    } finally {
      setIsSearching(false)
    }
  }

  const properties = parcel?.properties ?? {}
  const parcelId = countyRecord?.parcelNumber ?? firstValue(properties, ['ParcelNumber', 'PRCLID', 'PIN', 'PARCEL_ID', 'PARCELID', 'PARCEL', 'Parcel'])
  const parcelAcres = numericValue(properties, ['ACRES', 'Acres', 'ACREAGE', 'Acreage', 'CALCACRES'])
  const acres = countyRecord?.acres ?? parcelAcres
  const appraised = countyRecord?.appraisedTotal ?? firstValue(properties, ['APRTOT', 'APPRAISED', 'APPRAISED_VALUE', 'MARKET_VALUE', 'TOTAL_VALUE'])
  const livingArea = countyRecord?.dwelling?.livingArea ?? numericValue(properties, ['SQ_FT', 'LIVING_AREA', 'LIVAREA', 'SQUARE_FEET', 'SF'])
  const yearBuilt = countyRecord?.dwelling?.yearBuilt ?? firstValue(properties, ['YRBLT', 'YEAR_BUILT', 'YEARBUILT'])
  const zoning = firstValue(properties, ['ZoneType', 'ZONING', 'Zoning', 'ZONE'])

  const quickFacts = countyRecord ? [
    ['Home size', livingArea ? `${livingArea.toLocaleString()} sf` : '—'],
    ['Year built', yearBuilt ? String(yearBuilt) : '—'],
    ['Appraised', money(appraised)],
    ['Current tax', money(countyRecord.currentTax)],
  ] : [
    ['Acres', acres ? acres.toFixed(2) : 'Parcel pending'],
    [livingArea ? 'Home size' : 'Elevation', livingArea ? `${livingArea.toLocaleString()} sf` : intelligence?.terrain.value ?? (intelligenceLoading ? 'Checking…' : '—')],
    [yearBuilt ? 'Year built' : 'Soil', yearBuilt ? String(yearBuilt) : intelligence?.soil.value ?? (intelligenceLoading ? 'Checking…' : '—')],
    [appraised ? 'Appraised' : 'Flood', appraised ? money(appraised) : intelligence?.flood.value ?? (intelligenceLoading ? 'Checking…' : '—')],
  ]

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
            <div className="property-topbar"><form className="compact-search" onSubmit={handleSubmit}><input value={address} onChange={(event) => setAddress(event.target.value)} aria-label="Search another property" /><button type="submit" disabled={isSearching}>{isSearching ? 'Analyzing…' : 'Search'}</button></form><span className="report-status">{countyRecord ? 'County record verified' : parcel ? 'Parcel verified' : 'Address verified'}</span></div>

            <header className="property-identity">
              <div><p className="eyebrow">ATLAS PROPERTY REPORT</p><h1>{locatedProperty?.address}</h1><div className="identity-meta"><span className="evidence-badge verified">Verified address</span><span>{locatedProperty?.county ? `${locatedProperty.county} County` : 'Ohio'}</span><span>{countyRecord?.source ?? locatedProperty?.source}</span></div></div>
              <div className="quick-facts">{quickFacts.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
            </header>

            <div className="property-hero-grid">
              <section className="report-map-card">
                <div className="live-map report-map" ref={mapContainer} />
                <div className="map-overlay-label">AERIAL · {parcel ? 'PARCEL VERIFIED' : 'ADDRESS LOCATED'}</div>
                <div className="map-layer-quick" aria-label="Quick map layers">
                  {['Terrain', 'Soils', 'Flood', 'Wetlands'].map((layer) => <button key={layer} className={activeLayers.includes(layer) ? 'active' : ''} onClick={() => toggleLayer(layer)}>{layer}</button>)}
                </div>
                <div className="map-bottom-bar"><div><span className="mini-label">MAP STATUS</span><strong>{parcel ? 'Verified parcel boundary' : 'Statewide layers ready · parcel boundary awaiting county GIS source'}</strong></div><span className={parcel ? 'location-pill verified-pill' : 'location-pill'}>{parcel ? 'Verified' : 'Located'}</span></div>
              </section>
              <aside className="property-summary-card">
                <div className="summary-heading"><span>Property snapshot</span><small>{countyRecord?.source ?? parcelProvider ?? 'Statewide + federal public records'}</small></div>
                <div className="summary-list">
                  <div><span>Parcel ID</span><strong>{String(parcelId ?? 'Requires county parcel record')}</strong></div>
                  {countyRecord && <div><span>Last sale</span><strong>{money(countyRecord.salePrice)} · {dateLabel(countyRecord.saleDate)}</strong></div>}
                  {countyRecord && <div><span>Home</span><strong>{countyRecord.dwelling ? `${countyRecord.dwelling.bedrooms ?? '—'} bd · ${countyRecord.dwelling.fullBaths ?? '—'} ba · ${countyRecord.dwelling.stories ?? '—'} story` : 'Requires dwelling record'}</strong></div>}
                  {countyRecord && <div><span>Land use</span><strong>{countyRecord.landUse ?? 'Requires verification'}</strong></div>}
                  {countyRecord && <div><span>School district</span><strong>{countyRecord.schoolDistrict ?? '—'}</strong></div>}
                  {countyRecord && <div><span>CAUV</span><strong>{countyRecord.hasCauv ? 'Enrolled' : 'Not enrolled'}</strong></div>}
                  {!countyRecord && <div><span>Zoning</span><strong>{String(zoning ?? 'Requires local verification')}</strong></div>}
                  <div><span>Soil</span><strong>{intelligence?.soil.value ?? (intelligenceLoading ? 'Checking…' : 'Requires verification')}</strong></div>
                  <div><span>County</span><strong>{locatedProperty?.county ? `${locatedProperty.county} County` : 'Resolving'}</strong></div>
                </div>
                {countyRecord?.acreageRecordRaw === 0 && <div className="status-note"><span className="status-dot" />Brown County's current property record reports 0.0000 acres for this record. ATLAS will not present that as true parcel acreage until the GIS/land record is reconciled.</div>}
                <div className="status-note"><span className="status-dot" />{countyRecordLoading ? 'Loading county property record…' : searchStatus}</div>
              </aside>
            </div>
          </section>

          <nav className="report-nav" aria-label="Property report sections">{reportNav.map((item) => <button key={item} className={activeSection === item ? 'active' : ''} onClick={() => setActiveSection(item)}>{item}</button>)}</nav>

          <section className="report-content">
            {activeSection === 'Overview' && (
              <>
                <div className="section-heading"><div><p className="eyebrow">OVERVIEW</p><h2>The property at a glance.</h2></div><p>ATLAS separates official records, derived spatial findings and questions that still need local verification.</p></div>
                <IntelligenceStrip intelligence={intelligence} loading={intelligenceLoading} />
                <div className="overview-grid overview-actions">
                  <article className="intel-card feature-card"><span className="card-kicker">THE HOME</span><h3>Home & value</h3><p>{countyRecord?.dwelling ? `${countyRecord.dwelling.livingArea?.toLocaleString() ?? '—'} sq ft · ${countyRecord.dwelling.bedrooms ?? '—'} bed · ${countyRecord.dwelling.fullBaths ?? '—'} bath · built ${countyRecord.dwelling.yearBuilt ?? '—'}. County appraisal ${money(countyRecord.appraisedTotal)}.` : 'County building/value records are the remaining local adapter.'}</p><button onClick={() => setActiveSection('Home & Value')}>Open Home & Value →</button></article>
                  <article className="intel-card feature-card"><span className="card-kicker">THE LAND</span><h3>Land intelligence</h3><p>{intelligence ? `${intelligence.soil.value}. ${intelligence.terrain.value}.` : 'Soils, terrain, flood and wetlands are being assembled.'}</p><button onClick={() => setActiveSection('Land & Maps')}>Open Land & Maps →</button></article>
                  <article className="intel-card feature-card"><span className="card-kicker">DUE DILIGENCE</span><h3>What needs attention?</h3><p>{intelligence ? `${intelligence.flood.value}. ${intelligence.wetlands.value}.` : 'Flood, wetlands, zoning, septic and access checks stay together.'}</p><button onClick={() => setActiveSection('Risks')}>Review Risks →</button></article>
                </div>
                <div className="rural-smart-cta"><div><p className="eyebrow">RURAL POTENTIAL</p><h2>Turn the evidence into “what could I do here?”</h2><p>ATLAS now uses soil, terrain and mapped water constraints as inputs, while keeping zoning, acreage and septic gaps visible.</p></div><button onClick={() => setActiveSection('Rural Potential')}>Analyze rural potential →</button></div>
              </>
            )}
            {activeSection === 'Home & Value' && <HomeValueSection parcelVerified={Boolean(parcel)} county={locatedProperty?.county ?? null} record={countyRecord} />}
            {activeSection === 'Land & Maps' && <LandMapsSection intelligence={intelligence} loading={intelligenceLoading} activeLayers={activeLayers} onToggleLayer={toggleLayer} />}
            {activeSection === 'Rural Potential' && <RuralPotentialSection intelligence={intelligence} acres={acres} zoningKnown={Boolean(zoning)} />}
            {activeSection === 'Risks' && <RisksSection intelligence={intelligence} county={locatedProperty?.county ?? null} parcelVerified={Boolean(parcel)} />}
            {activeSection === 'Costs' && <CostsSection county={locatedProperty?.county ?? null} record={countyRecord} />}
          </section>
        </>
      )}
    </main>
  )
}

export default App