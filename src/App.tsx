import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { resolveCountyParcel, resolveOhioAddress } from './services/ohioProperty'
import type { LocatedProperty, ParcelFeature } from './services/ohioProperty'
import { getPropertyIntelligence } from './services/propertyIntelligence'
import type { PropertyIntelligence } from './services/propertyIntelligence'
import { getCountyPropertyRecord } from './services/countyRecords'
import type { CountyPropertyRecord } from './services/countyRecords'
import { getResearchProfile, researchNumber, researchText } from './services/researchProfile'
import type { ResearchProfile } from './services/researchProfile'
import { buildAtlasValuation } from './services/valuationEngine'
import { HomeValueSection, IntelligenceStrip, RisksSection, RuralPotentialSection, CostsSection } from './components/IntelligenceReport'
import { ResearchCostsSection, ResearchHomeValueSection } from './components/ResearchEvidence'
import PropertyMap from './components/PropertyMap'
import HomeownerOverview from './components/HomeownerOverview'

const clientNav = ['Brief', 'Explore', 'Plan', 'Money'] as const
type ClientSection = typeof clientNav[number]

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
  const [activeSection, setActiveSection] = useState<ClientSection>('Brief')
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
    setActiveSection('Brief')
    setSearchStatus('Building your private property brief…')

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

      if (nextResearchProfile) setSearchStatus('Client brief ready · market, property and land evidence assembled.')
      else if (parcelData?.parcel) setSearchStatus('Property and land brief ready · market research is still limited for this address.')
      else setSearchStatus('Address brief ready · local parcel and property records are still being connected.')
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

  const briefItems = useMemo(() => {
    const rows: Array<{ label: string; title: string; detail: string; tone?: string }> = []
    if (valuation) rows.push({ label: 'Market position', title: `${money(valuation.estimate)} ATLAS estimate`, detail: `${money(valuation.rangeLow)}–${money(valuation.rangeHigh)} likely range · ${valuation.confidence} confidence.` })
    if (acres) rows.push({ label: 'Land', title: `${acres.toFixed(2)} acres`, detail: parcel ? 'Parcel geometry is available for map-based review.' : 'Recorded acreage is available; parcel geometry still needs verification.' })
    if (intelligence?.flood) rows.push({ label: 'Due diligence', title: intelligence.flood.value, detail: intelligence.flood.detail, tone: intelligence.flood.status === 'Problem' ? 'attention' : undefined })
    if (intelligence?.wetlands) rows.push({ label: 'Land signal', title: intelligence.wetlands.value, detail: intelligence.wetlands.detail })
    if (zoning) rows.push({ label: 'Local rules', title: zoning, detail: 'Zoning is a starting point; proposed uses still need local verification.' })
    return rows.slice(0, 5)
  }, [valuation, acres, parcel, intelligence, zoning])

  return (
    <main className={hasProperty ? 'site-shell client-atlas' : 'site-shell'}>
      <nav className="nav-shell client-brandbar" aria-label="Primary navigation">
        <a className="brand" href="/" aria-label="ATLAS home"><span className="brand-mark">A</span><span><strong>ATLAS</strong><small>by Holton Homes</small></span></a>
        <span className="nav-status">Private Client Intelligence</span>
      </nav>

      {!hasProperty ? (
        <>
          <section className="hero landing-hero private-landing">
            <div className="hero-copy">
              <p className="eyebrow">HOLTON HOMES · PRIVATE PROPERTY INTELLIGENCE</p>
              <h1>Know the property before it surprises you.</h1>
              <p className="lede">ATLAS is the private property-intelligence workspace used with Holton Homes clients to understand value, land, risk and possibilities beyond the listing.</p>
              <form className="search-card" onSubmit={handleSubmit}>
                <label htmlFor="property-address">Open a property room</label>
                <div className="search-row"><input id="property-address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Enter an Ohio property address" autoComplete="street-address" /><button type="submit" disabled={isSearching}>{isSearching ? 'Building brief…' : 'Open ATLAS'}</button></div>
                <p className={searchStatus ? 'search-status active' : 'search-status'}>{searchStatus || 'Client access combines public records, mapped evidence and Holton Homes analysis in one guided property room.'}</p>
              </form>
            </div>
            <aside className="private-access-card">
              <span>CLIENT ACCESS</span>
              <strong>More than a listing portal.</strong>
              <p>Property context, land intelligence, valuation evidence, planning ideas and the questions worth asking before a decision.</p>
              <div><b>Prepared with Holton Homes</b><small>Evidence first · conclusions explained</small></div>
            </aside>
          </section>
        </>
      ) : locatedProperty ? (
        <>
          <section className="client-property-masthead">
            <div className="client-property-topline">
              <div><span>PRIVATE PROPERTY ROOM</span><strong>Prepared by Jacob Holton · Holton Homes</strong></div>
              <form className="compact-search" onSubmit={handleSubmit}><input value={address} onChange={(event) => setAddress(event.target.value)} aria-label="Search another property" /><button type="submit" disabled={isSearching}>{isSearching ? 'Building…' : 'Open another'}</button></form>
            </div>
            <div className="client-property-title">
              <div>
                <p className="eyebrow">YOUR ATLAS BRIEF</p>
                <h1>{locatedProperty.address}</h1>
                <p>{searchStatus}</p>
              </div>
              <div className="client-proof-stack">
                <span>{locatedProperty.county ? `${locatedProperty.county} County` : 'Ohio'}</span>
                <span>{parcel ? 'Parcel verified' : 'Address verified'}</span>
                {valuation && <strong>{money(valuation.estimate)} <small>ATLAS estimate</small></strong>}
              </div>
            </div>
          </section>

          <nav className="client-room-nav" aria-label="Client property room">
            {clientNav.map((item, index) => <button key={item} className={activeSection === item ? 'active' : ''} onClick={() => setActiveSection(item)}><i>{String(index + 1).padStart(2, '0')}</i><span>{item}</span></button>)}
          </nav>

          <AnimatePresence mode="wait">
            <motion.section key={activeSection} className="report-content client-room-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .3, ease: [0.22, 1, 0.36, 1] }}>
              {activeSection === 'Brief' && (
                <>
                  <section className="client-brief-intro">
                    <div><span>WHAT MATTERS HERE</span><h2>The short version before the rabbit hole.</h2></div>
                    <p>ATLAS keeps the technical evidence underneath the experience and brings forward the items most likely to change a property decision.</p>
                  </section>
                  <div className="client-brief-grid">
                    {briefItems.map((item, index) => <motion.article key={`${item.label}-${index}`} className={item.tone === 'attention' ? 'client-brief-item attention' : 'client-brief-item'} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .06 }}><span>{item.label}</span><strong>{item.title}</strong><p>{item.detail}</p></motion.article>)}
                  </div>
                  <section className="jacob-take">
                    <div><span>JACOB'S TAKE</span><strong>Start with the property, then verify the things that can change the decision.</strong></div>
                    <p>ATLAS is designed to surface what deserves a closer look. Mapped layers, tax records and automated estimates are evidence—not substitutes for local verification, inspections, surveys, permits or professional advice.</p>
                  </section>
                  <HomeownerOverview researchProfile={researchProfile} intelligence={intelligence} countyRecord={countyRecord} acres={acres} livingArea={livingArea} bedrooms={bedrooms} baths={fullBaths} salePrice={salePrice} annualTaxDisplay={annualTaxDisplay} parcelId={parcelId} zoning={zoning} classificationMls={classificationMls} classificationPublic={classificationPublic} onOpenValue={() => setActiveSection('Money')} onOpenLand={() => setActiveSection('Explore')} onOpenRisks={() => setActiveSection('Explore')} />
                </>
              )}

              {activeSection === 'Explore' && (
                <div className="client-workspace">
                  <div className="client-workspace-heading"><span>EXPLORE THE PROPERTY</span><h2>One map. Every useful layer.</h2><p>Move through aerial, terrain, soil, water, flood and wetlands without leaving the property room.</p></div>
                  <PropertyMap property={locatedProperty} parcel={parcel} parcelVerified={Boolean(parcel)} />
                  <IntelligenceStrip intelligence={intelligence} loading={!intelligence} />
                  <div className="explore-two-up">
                    <article><span>HOME & SITE</span><strong>{livingArea ? `${bedrooms ?? '—'} bd · ${fullBaths ?? '—'} ba · ${livingArea.toLocaleString()} sf` : 'Home facts need verification'}</strong><p>{yearBuilt ? `Built ${yearBuilt}. ` : ''}{acres ? `${acres.toFixed(2)} acres. ` : ''}{zoning ? `${zoning} zoning reference.` : 'Local zoning still needs verification.'}</p></article>
                    <article><span>WHAT TO VERIFY NEXT</span><strong>Use the map as a screening tool.</strong><p>Flood, wetlands, soils and terrain can change how land feels and functions. Local rules, septic, access, easements and permits still require source-level verification.</p></article>
                  </div>
                  <RisksSection intelligence={intelligence} county={locatedProperty.county} parcelVerified={Boolean(parcel)} />
                </div>
              )}

              {activeSection === 'Plan' && (
                <div className="client-workspace">
                  <div className="client-workspace-heading"><span>PLAN THE PROPERTY</span><h2>What could life here look like?</h2><p>Use the property itself as the canvas, then let ATLAS flag what should be checked before an idea becomes a plan.</p></div>
                  <PropertyMap property={locatedProperty} parcel={parcel} parcelVerified={Boolean(parcel)} />
                  <RuralPotentialSection intelligence={intelligence} acres={acres} zoningKnown={Boolean(zoning)} />
                </div>
              )}

              {activeSection === 'Money' && (
                <div className="client-workspace money-workspace">
                  <div className="client-workspace-heading"><span>MONEY</span><h2>Value, equity, taxes and what ownership may cost.</h2><p>Market evidence and public tax records are kept separate so historical tax data is never presented like a guaranteed future bill.</p></div>
                  {researchProfile ? <ResearchHomeValueSection profile={researchProfile} /> : <HomeValueSection parcelVerified={Boolean(parcel)} county={locatedProperty.county} record={countyRecord} />}
                  {researchProfile ? <ResearchCostsSection profile={researchProfile} countyRecord={countyRecord} /> : <CostsSection county={locatedProperty.county} record={countyRecord} />}
                </div>
              )}
            </motion.section>
          </AnimatePresence>

          <section className="client-evidence-drawer">
            <details>
              <summary><span>Records, sources & methodology</span><small>Open the evidence room</small></summary>
              <div className="records-grid records-page-grid">
                <div><span>Parcel ID</span><strong>{String(parcelId ?? 'Requires verification')}</strong></div>
                <div><span>Zoning</span><strong>{zoning ?? 'Requires local verification'}</strong></div>
                <div><span>County source</span><strong>{parcelProvider ?? countyRecord?.source ?? locatedProperty.source}</strong></div>
                <div><span>County appraisal</span><strong>{money(countyRecord?.appraisedTotal)}</strong></div>
                <div><span>Taxable assessment</span><strong>{money(countyRecord?.assessedTotal)}</strong></div>
                <div><span>Research review</span><strong>{researchProfile ? dateLabel(researchProfile.reviewed_at) : 'No reviewed profile'}</strong></div>
              </div>
              {researchProfile?.sources?.length ? <div className="source-link-list">{researchProfile.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer"><span>{source.role || source.type}</span><strong>{source.name}</strong>↗</a>)}</div> : null}
            </details>
          </section>

          <footer className="private-client-foot"><span>ATLAS by Holton Homes</span><p>Prepared as a client decision-support experience. Verify material property, legal, tax, zoning, environmental and financing questions with the appropriate official source or professional.</p></footer>
        </>
      ) : null}
    </main>
  )
}
