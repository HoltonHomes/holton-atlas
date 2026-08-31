import { useState } from 'react'
import type { FormEvent } from 'react'
import { resolveCountyParcel, resolveOhioAddress } from './services/ohioProperty'
import type { LocatedProperty, ParcelFeature } from './services/ohioProperty'
import { getPropertyIntelligence } from './services/propertyIntelligence'
import type { PropertyIntelligence } from './services/propertyIntelligence'
import { getCountyPropertyRecord } from './services/countyRecords'
import type { CountyPropertyRecord } from './services/countyRecords'
import { getResearchProfile, researchNumber, researchText } from './services/researchProfile'
import type { ResearchProfile } from './services/researchProfile'
import { buildAtlasValuation } from './services/valuationEngine'
import {
  CostsSection,
  HomeValueSection,
  IntelligenceStrip,
  RisksSection,
  RuralPotentialSection,
} from './components/IntelligenceReport'
import {
  ResearchBadge,
  ResearchCostsSection,
  ResearchHomeValueSection,
} from './components/ResearchEvidence'
import PropertyMap from './components/PropertyMap'
import HomeownerOverview from './components/HomeownerOverview'

const reportNav = ['Overview', 'Value & Equity', 'Home & Property', 'Land & Maps', 'Property Ideas', 'Risks', 'Taxes & Costs', 'Records & Sources']
type ViewMode = 'owner' | 'buyer'

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

export default function App() {
  const [address, setAddress] = useState('')
  const [locatedProperty, setLocatedProperty] = useState<LocatedProperty | null>(null)
  const [parcel, setParcel] = useState<ParcelFeature | null>(null)
  const [parcelProvider, setParcelProvider] = useState<string | null>(null)
  const [countyRecord, setCountyRecord] = useState<CountyPropertyRecord | null>(null)
  const [researchProfile, setResearchProfile] = useState<ResearchProfile | null>(null)
  const [intelligence, setIntelligence] = useState<PropertyIntelligence | null>(null)
  const [searchStatus, setSearchStatus] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [activeSection, setActiveSection] = useState('Overview')
  const [viewMode, setViewMode] = useState<ViewMode>('owner')
  const hasProperty = Boolean(locatedProperty)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = address.trim()
    if (!query) return

    setIsSearching(true)
    setResearchProfile(null)
    setCountyRecord(null)
    setParcel(null)
    setParcelProvider(null)
    setIntelligence(null)
    setActiveSection('Overview')
    setSearchStatus('Locating the property and assembling the useful parts first…')

    try {
      const property = await resolveOhioAddress(query)
      if (!property) {
        setLocatedProperty(null)
        setSearchStatus('No confident Ohio address match found. Try the full street address, city and ZIP.')
        return
      }

      setLocatedProperty(property)
      const [nextIntelligence, parcelData, nextCountyRecord, nextResearchProfile] = await Promise.all([
        getPropertyIntelligence(property.longitude, property.latitude),
        property.county ? resolveCountyParcel(property.county, property.longitude, property.latitude) : Promise.resolve(null),
        getCountyPropertyRecord(property.county, property.address).catch(() => null),
        getResearchProfile(property.address).catch(() => null),
      ])

      setIntelligence(nextIntelligence)
      setCountyRecord(nextCountyRecord)
      setResearchProfile(nextResearchProfile)
      if (parcelData?.supported && parcelData.parcel && !parcelData.error) {
        setParcel(parcelData.parcel)
        setParcelProvider(parcelData.provider ?? `${property.county} County GIS`)
      }

      if (nextResearchProfile) setSearchStatus('Home facts, market evidence, property records and land intelligence loaded.')
      else if (parcelData?.parcel) setSearchStatus('Verified parcel and statewide land intelligence loaded. Market/property research is still limited for this address.')
      else setSearchStatus('Address and statewide land intelligence loaded. Local property records are still being connected.')
    } catch (error) {
      setLocatedProperty(null)
      setParcel(null)
      setCountyRecord(null)
      setResearchProfile(null)
      setIntelligence(null)
      setSearchStatus(`ATLAS search error: ${error instanceof Error ? error.message : 'Unable to resolve property'}`)
    } finally {
      setIsSearching(false)
    }
  }

  const properties = parcel?.properties ?? {}
  const parcelId = researchText(researchProfile, ['parcel', 'parcelNumber']) ?? countyRecord?.parcelNumber ?? firstValue(properties, ['PARCELNUMB', 'ParcelNumber', 'PRCLID', 'PIN', 'PID', 'SIDWELL_C', 'PARNUM', 'PARCEL_ID', 'PARCELID', 'PARCEL', 'Parcel'])
  const parcelAcres = numericValue(properties, ['ACREAGE', 'ACRES', 'Acres', 'acres', 'GISACRE', 'Acreage', 'CALCACRES'])
  const acres = researchNumber(researchProfile, ['lot', 'acres']) ?? countyRecord?.acres ?? parcelAcres
  const livingArea = researchNumber(researchProfile, ['homeFacts', 'livingAreaSqFt']) ?? countyRecord?.dwelling?.livingArea ?? numericValue(properties, ['SQ_FT', 'LIVING_AREA', 'LIVAREA', 'SQUARE_FEET', 'SF'])
  const yearBuilt = researchNumber(researchProfile, ['homeFacts', 'yearBuilt']) ?? countyRecord?.dwelling?.yearBuilt ?? numericValue(properties, ['YRBLT', 'YEAR_BUILT', 'YEARBUILT'])
  const bedrooms = researchNumber(researchProfile, ['homeFacts', 'bedrooms']) ?? countyRecord?.dwelling?.bedrooms
  const fullBaths = researchNumber(researchProfile, ['homeFacts', 'fullBathrooms']) ?? countyRecord?.dwelling?.fullBaths
  const parcelZoning = firstValue(properties, ['ZoneType', 'ZONING', 'Zoning', 'ZONE'])
  const zoning = researchText(researchProfile, ['zoning', 'value']) ?? (parcelZoning ? String(parcelZoning) : null)
  const salePrice = researchNumber(researchProfile, ['sale', 'price']) ?? countyRecord?.salePrice ?? null
  const saleDate = researchText(researchProfile, ['sale', 'mlsCloseDate']) ?? countyRecord?.saleDate
  const annualTaxDisplay = researchText(researchProfile, ['tax', 'annualTaxDisplay'])
  const classificationMls = researchText(researchProfile, ['classification', 'mlsDisplay'])
  const classificationPublic = researchText(researchProfile, ['classification', 'publicRecordDisplay'])
  const valuation = buildAtlasValuation(researchProfile)

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
              <p className="lede">Value, equity, property records, land, taxes, terrain, soil, water and rural potential in one clear report.</p>
              <form className="search-card" onSubmit={handleSubmit}>
                <label htmlFor="property-address">Search a property</label>
                <div className="search-row"><input id="property-address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Enter any Ohio street address" autoComplete="street-address" /><button type="submit" disabled={isSearching}>{isSearching ? 'Analyzing…' : 'Analyze property'}</button></div>
                <p className={searchStatus ? 'search-status active' : 'search-status'}>{searchStatus || 'Start with an address. ATLAS will decide which records matter and keep technical evidence in the background.'}</p>
              </form>
            </div>
            <aside className="preview-card homeowner-preview-card">
              <p className="eyebrow">BUILT AROUND DECISIONS</p>
              <h2>Your value first. The record dump second.</h2>
              <div className="landing-preview-stack"><div><span>Estimated market value</span><strong>Weighted from market evidence</strong></div><div><span>Estimated equity</span><strong>Calculated from your loan balance</strong></div><div><span>Land intelligence</span><strong>Maps when you actually need them</strong></div></div>
            </aside>
          </section>
          <section className="landing-proof"><p className="eyebrow">ONE PROPERTY · ONE CLEAR REPORT</p><h2>What it may be worth, what you may own, and what you should know.</h2><div className="landing-pill-row"><span>Market value</span><span>Equity</span><span>Taxes</span><span>Land & risks</span></div></section>
        </>
      ) : locatedProperty ? (
        <>
          <section className="property-shell owner-report-shell">
            <div className="property-topbar">
              <form className="compact-search" onSubmit={handleSubmit}><input value={address} onChange={(event) => setAddress(event.target.value)} aria-label="Search another property" /><button type="submit" disabled={isSearching}>{isSearching ? 'Analyzing…' : 'Search'}</button></form>
              <div className="view-mode-switch" aria-label="Report view">
                <button className={viewMode === 'owner' ? 'active' : ''} onClick={() => setViewMode('owner')}>I own this</button>
                <button className={viewMode === 'buyer' ? 'active' : ''} onClick={() => setViewMode('buyer')}>I’m evaluating it</button>
              </div>
            </div>

            <header className="property-identity owner-first">
              <div>
                <p className="eyebrow">ATLAS PROPERTY REPORT</p>
                <h1>{locatedProperty.address}</h1>
                <div className="identity-meta">
                  <span className="evidence-badge verified">Verified address</span>
                  <span>{locatedProperty.county ? `${locatedProperty.county} County` : 'Ohio'}</span>
                  {parcel && <span>Parcel verified</span>}
                  <ResearchBadge profile={researchProfile} />
                  {valuation && <span className="research-badge value-badge">ATLAS est. {money(valuation.estimate)} · {valuation.confidence}</span>}
                </div>
                <p className="report-load-status">{searchStatus}</p>
              </div>
            </header>
          </section>

          <nav className="report-nav" aria-label="Property report sections">{reportNav.map((item) => <button key={item} className={activeSection === item ? 'active' : ''} onClick={() => setActiveSection(item)}>{item}</button>)}</nav>

          <section className="report-content homeowner-report-content">
            {activeSection === 'Overview' && viewMode === 'owner' && (
              <>
                <HomeownerOverview
                  researchProfile={researchProfile}
                  intelligence={intelligence}
                  countyRecord={countyRecord}
                  acres={acres}
                  livingArea={livingArea}
                  bedrooms={bedrooms}
                  baths={fullBaths}
                  salePrice={salePrice}
                  annualTaxDisplay={annualTaxDisplay}
                  parcelId={parcelId}
                  zoning={zoning}
                  classificationMls={classificationMls}
                  classificationPublic={classificationPublic}
                  onOpenValue={() => setActiveSection('Value & Equity')}
                  onOpenLand={() => setActiveSection('Land & Maps')}
                  onOpenRisks={() => setActiveSection('Risks')}
                />
                <div className="owner-map-preview">
                  <div className="section-heading compact"><div><p className="eyebrow">YOUR LAND</p><h2>Open the map when the land matters.</h2></div><p>Aerial, terrain and topographic views now change the base map itself. Soil, water, flood and wetlands are separate overlays.</p></div>
                  <PropertyMap property={locatedProperty} parcel={parcel} parcelVerified={Boolean(parcel)} compact />
                </div>
              </>
            )}

            {activeSection === 'Overview' && viewMode === 'buyer' && (
              <>
                <div className="section-heading"><div><p className="eyebrow">BUYER / LAND VIEW</p><h2>Start with the property itself.</h2></div><p>For a property you are evaluating, ATLAS puts the parcel, land and due-diligence evidence ahead of homeowner equity.</p></div>
                <PropertyMap property={locatedProperty} parcel={parcel} parcelVerified={Boolean(parcel)} />
                <IntelligenceStrip intelligence={intelligence} loading={!intelligence} />
                <div className="overview-grid overview-actions buyer-overview-actions">
                  <article className="intel-card feature-card"><span className="card-kicker">HOME</span><h3>{livingArea ? `${bedrooms ?? '—'} bd · ${fullBaths ?? '—'} ba · ${livingArea.toLocaleString()} sf` : 'Home facts pending'}</h3><p>{yearBuilt ? `Built ${yearBuilt}. ` : ''}{salePrice ? `Last recorded sale ${money(salePrice)} on ${dateLabel(saleDate)}.` : ''}</p><button onClick={() => setActiveSection('Home & Property')}>Review the home →</button></article>
                  <article className="intel-card feature-card"><span className="card-kicker">LAND</span><h3>{acres ? `${acres.toFixed(2)} acres` : 'Parcel acreage pending'}</h3><p>{intelligence ? `${intelligence.soil.value}. ${intelligence.terrain.value}.` : 'Land intelligence is loading.'}</p><button onClick={() => setActiveSection('Land & Maps')}>Open land analysis →</button></article>
                  <article className="intel-card feature-card"><span className="card-kicker">DUE DILIGENCE</span><h3>What could limit it?</h3><p>{intelligence ? `${intelligence.flood.value}. ${intelligence.wetlands.value}.` : 'Flood, wetlands, zoning, septic and access stay together.'}</p><button onClick={() => setActiveSection('Risks')}>Review risks →</button></article>
                </div>
              </>
            )}

            {activeSection === 'Value & Equity' && (researchProfile ? <ResearchHomeValueSection profile={researchProfile} /> : <HomeValueSection parcelVerified={Boolean(parcel)} county={locatedProperty.county} record={countyRecord} />)}

            {activeSection === 'Home & Property' && (
              <div className="data-section">
                <div className="section-heading"><div><p className="eyebrow">HOME & PROPERTY</p><h2>What is physically here?</h2></div><p>This is the practical property profile: corroborated home facts, lot size and improvements. Tax classifications and market estimates stay in their own sections.</p></div>
                <div className="source-plan-grid purpose-grid">
                  <article className="intel-card"><span className="card-kicker">THE HOME</span><h3>{livingArea ? `${livingArea.toLocaleString()} sq ft` : 'Needs verification'}</h3><p>{bedrooms ?? '—'} bedrooms · {fullBaths ?? '—'} full baths · built {yearBuilt ?? '—'}. Facts are promoted only when the appropriate property/MLS evidence supports them.</p></article>
                  <article className="intel-card"><span className="card-kicker">THE LOT</span><h3>{acres ? `${acres.toFixed(2)} acres` : 'Needs verification'}</h3><p>Parcel geometry and stated acreage are separate evidence. Open Land & Maps to understand what the acreage contains.</p></article>
                  <article className="intel-card"><span className="card-kicker">LAST TRANSFER</span><h3>{money(salePrice)}</h3><p>{dateLabel(saleDate)}. A recorded transfer is transaction evidence; it is not automatically today's market value.</p></article>
                </div>
              </div>
            )}

            {activeSection === 'Land & Maps' && (
              <div className="data-section">
                <div className="section-heading"><div><p className="eyebrow">LAND & MAPS</p><h2>Read the land as a system.</h2></div><p>Switch the actual base map between Aerial, Terrain and Topographic. Then layer soil, water, flood and wetlands on top.</p></div>
                <PropertyMap property={locatedProperty} parcel={parcel} parcelVerified={Boolean(parcel)} />
                <IntelligenceStrip intelligence={intelligence} loading={!intelligence} />
                <div className="interpretation-card"><span className="card-kicker">SOURCE DISCIPLINE</span><h3>Maps are evidence, not permits.</h3><p>ATLAS keeps parcel geometry, official environmental layers and local records separate. A visible map overlay is a screening signal until parcel-wide intersections and local rules are verified.</p></div>
              </div>
            )}

            {activeSection === 'Property Ideas' && <RuralPotentialSection intelligence={intelligence} acres={acres} zoningKnown={Boolean(zoning)} />}
            {activeSection === 'Risks' && <RisksSection intelligence={intelligence} county={locatedProperty.county} parcelVerified={Boolean(parcel)} />}
            {activeSection === 'Taxes & Costs' && (researchProfile ? <ResearchCostsSection profile={researchProfile} countyRecord={countyRecord} /> : <CostsSection county={locatedProperty.county} record={countyRecord} />)}
            {activeSection === 'Records & Sources' && (
              <div className="data-section">
                <div className="section-heading"><div><p className="eyebrow">RECORDS & SOURCES</p><h2>The evidence room.</h2></div><p>Use this when you need to audit a number—not as the first screen a homeowner has to decode.</p></div>
                <div className="records-grid records-page-grid">
                  <div><span>Parcel ID</span><strong>{String(parcelId ?? 'Requires verification')}</strong></div><div><span>Zoning</span><strong>{zoning ?? 'Requires local verification'}</strong></div><div><span>County source</span><strong>{parcelProvider ?? countyRecord?.source ?? locatedProperty.source}</strong></div><div><span>County appraisal</span><strong>{money(countyRecord?.appraisedTotal)}</strong></div><div><span>Taxable assessment</span><strong>{money(countyRecord?.assessedTotal)}</strong></div><div><span>Research review</span><strong>{researchProfile ? dateLabel(researchProfile.reviewed_at) : 'No reviewed profile'}</strong></div>
                </div>
                {researchProfile?.sources?.length ? <div className="source-link-list">{researchProfile.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer"><span>{source.role || source.type}</span><strong>{source.name}</strong>↗</a>)}</div> : <div className="interpretation-card"><span className="card-kicker">EVIDENCE STATUS</span><h3>Local source coverage is still limited.</h3><p>ATLAS will not invent a source list. County adapters and reviewed research appear here when available.</p></div>}
              </div>
            )}
          </section>

          <footer className="report-source-foot">Property records: {parcelProvider ?? countyRecord?.source ?? locatedProperty.source}. Technical records remain available in the report without controlling the homeowner experience.</footer>
        </>
      ) : null}
    </main>
  )
}
