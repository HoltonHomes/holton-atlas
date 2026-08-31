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
import { HomeValueSection, IntelligenceStrip, RisksSection, CostsSection } from './components/IntelligenceReport'
import { ResearchCostsSection, ResearchHomeValueSection } from './components/ResearchEvidence'
import PropertyMap from './components/PropertyMap'
import PlanConfigurator from './components/PlanConfigurator'
import ClientDecisionGuide from './components/ClientDecisionGuide'
import ComparableHomes from './components/ComparableHomes'
import PropertyResearch from './components/PropertyResearch'

const clientNav = ['Summary', 'Price', 'Homes', 'Property', 'Research'] as const
type ClientSection = typeof clientNav[number]
type ClientIntent = 'buyer' | 'seller' | 'researcher'

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

function reportTitle(intent: ClientIntent) {
  if (intent === 'buyer') return 'Buyer Home Report'
  if (intent === 'seller') return 'Seller Home Report'
  return 'Property Research Report'
}

function reportPromise(intent: ClientIntent) {
  if (intent === 'buyer') return 'Know what you are buying.'
  if (intent === 'seller') return 'Understand what your property may be worth.'
  return 'Explore the home, land and market around it.'
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
  const [activeSection, setActiveSection] = useState<ClientSection>('Summary')
  const [clientIntent, setClientIntent] = useState<ClientIntent | null>(null)
  const hasProperty = Boolean(locatedProperty)

  function chooseIntent(intent: ClientIntent) {
    setClientIntent(intent)
    setActiveSection('Summary')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = address.trim()
    if (!query) return

    setIsSearching(true)
    setClientIntent(null)
    setResearchProfile(null)
    setCountyRecord(null)
    setParcel(null)
    setParcelProvider(null)
    setIntelligence(null)
    setActiveSection('Summary')
    setSearchStatus('Finding the property and assembling the evidence…')

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

      if (nextResearchProfile) setSearchStatus('Property found · market, property and land evidence assembled.')
      else if (parcelData?.parcel) setSearchStatus('Property found · parcel and land evidence assembled; market research is still limited.')
      else setSearchStatus('Property found · local parcel and market records are still being connected.')
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
  const valuation = buildAtlasValuation(researchProfile)

  const briefItems = useMemo(() => {
    const rows: Array<{ label: string; title: string; detail: string; tone?: string }> = []
    if (valuation) rows.push({ label: clientIntent === 'seller' ? 'Estimated market range' : 'Price context', title: `${money(valuation.rangeLow)}–${money(valuation.rangeHigh)}`, detail: `${money(valuation.estimate)} current ATLAS center · ${valuation.confidence} evidence.` })
    if (acres) rows.push({ label: 'Land', title: `${acres.toFixed(2)} acres`, detail: parcel ? 'Recorded parcel geometry is available for map-based review.' : 'Recorded acreage is available; parcel geometry still needs verification.' })
    if (intelligence?.flood) rows.push({ label: 'Flood research', title: intelligence.flood.value, detail: intelligence.flood.detail, tone: intelligence.flood.status === 'Problem' ? 'attention' : undefined })
    if (intelligence?.wetlands) rows.push({ label: 'Wetlands research', title: intelligence.wetlands.value, detail: intelligence.wetlands.detail })
    if (zoning) rows.push({ label: 'Local rules', title: zoning, detail: 'This is a zoning reference, not approval of a proposed use.' })
    return rows.slice(0, 5)
  }, [valuation, acres, parcel, intelligence, zoning, clientIntent])

  const intentCopy = clientIntent === 'seller'
    ? {
        eyebrow: 'WHAT MATTERS BEFORE YOU LIST',
        title: 'What might it be worth—and what could change that?',
        detail: 'ATLAS keeps market evidence, property context and public-record blind spots in one seller story instead of treating your home like a single automated number.',
        take: 'Price the property buyers will actually experience, not just the tax record.',
      }
    : clientIntent === 'researcher'
      ? {
          eyebrow: 'PROPERTY RESEARCH',
          title: 'Understand the place without the rabbit hole.',
          detail: 'Start with the plain-English summary, then go deeper only where the property raises a question worth answering.',
          take: 'The useful part is knowing what the data proves—and where it stops.',
        }
      : {
          eyebrow: 'WHAT MATTERS BEFORE THE DECISION',
          title: 'The short version before you fall in love with the story.',
          detail: 'ATLAS brings forward the evidence most likely to change whether you pursue, price, inspect or walk away from a property.',
          take: 'Do not decide from the listing. Decide from the property.',
        }

  return (
    <main className={hasProperty ? 'site-shell client-atlas' : 'site-shell'}>
      <nav className="nav-shell client-brandbar" aria-label="Primary navigation">
        <a className="brand" href="/" aria-label="ATLAS home"><span className="brand-mark">A</span><span><strong>ATLAS</strong><small>by Holton Homes</small></span></a>
        <span className="nav-status">Property Intelligence by Holton Homes</span>
      </nav>

      {!hasProperty ? (
        <section className="hero landing-hero private-landing report-first-landing">
          <div className="hero-copy">
            <p className="eyebrow">HOLTON HOMES · PROPERTY INTELLIGENCE</p>
            <h1>Research any home.</h1>
            <p className="lede">Understand the house, the price, the land, and what matters before your next move.</p>
            <form className="search-card" onSubmit={handleSubmit}>
              <label htmlFor="property-address">Enter a property address</label>
              <div className="search-row"><input id="property-address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Enter an Ohio property address" autoComplete="street-address" /><button type="submit" disabled={isSearching}>{isSearching ? 'Researching…' : 'Research this property'}</button></div>
              <p className={searchStatus ? 'search-status active' : 'search-status'}>{searchStatus || 'Property research, made understandable. No giant dashboard before you even know what matters.'}</p>
            </form>
          </div>
          <aside className="private-access-card">
            <span>ATLAS BY HOLTON HOMES</span>
            <strong>One property. Three different questions.</strong>
            <p>Buyers, sellers and curious researchers use the same underlying evidence. ATLAS changes the story—not the truth.</p>
            <div><b>Evidence first</b><small>Public record · map clue · needs confirmation</small></div>
          </aside>
        </section>
      ) : locatedProperty && !clientIntent ? (
        <section className="property-reveal-shell">
          <div className="property-reveal-topbar">
            <div><span>PROPERTY FOUND</span><strong>{searchStatus}</strong></div>
            <form className="compact-search" onSubmit={handleSubmit}><input value={address} onChange={(event) => setAddress(event.target.value)} aria-label="Search another property" /><button type="submit" disabled={isSearching}>{isSearching ? 'Researching…' : 'Search another'}</button></form>
          </div>

          <div className="property-reveal-grid">
            <div className="property-reveal-visual">
              <div className="reveal-visual-label"><span>PROPERTY VIEW</span><strong>{parcel ? 'Aerial + recorded parcel' : 'Aerial location view'}</strong></div>
              <PropertyMap property={locatedProperty} parcel={parcel} parcelVerified={Boolean(parcel)} compact />
            </div>
            <div className="property-reveal-copy">
              <span>ATLAS PROPERTY REVEAL</span>
              <h1>{locatedProperty.address}</h1>
              <div className="reveal-facts">
                {bedrooms != null && <b>{bedrooms} bd</b>}
                {fullBaths != null && <b>{fullBaths} ba</b>}
                {livingArea != null && <b>{livingArea.toLocaleString()} sf</b>}
                {acres != null && <b>{acres.toFixed(2)} acres</b>}
                {yearBuilt != null && <b>Built {yearBuilt}</b>}
              </div>
              <p>Before ATLAS decides what to show first, tell it why you are looking at this property.</p>

              <div className="reveal-intent-grid">
                <button type="button" onClick={() => chooseIntent('buyer')}><span>I'M THINKING OF BUYING</span><strong>Help me understand what I am buying.</strong><small>Price · comps · land · possibilities · what to verify</small></button>
                <button type="button" onClick={() => chooseIntent('seller')}><span>I OWN THIS HOME</span><strong>Help me understand what it may be worth.</strong><small>Value · comps · buyer questions · selling context</small></button>
                <button type="button" onClick={() => chooseIntent('researcher')}><span>JUST EXPLORING</span><strong>Tell me everything useful about this place.</strong><small>Property · market · land · records</small></button>
              </div>
            </div>
          </div>
        </section>
      ) : locatedProperty && clientIntent ? (
        <>
          <section className="client-property-masthead">
            <div className="client-property-topline">
              <div><span>{reportTitle(clientIntent).toUpperCase()}</span><strong>Prepared with Holton Homes · {reportPromise(clientIntent)}</strong></div>
              <div className="property-room-actions">
                <div className="room-intent-switch" aria-label="Property report mode">
                  <button type="button" className={clientIntent === 'buyer' ? 'active' : ''} onClick={() => chooseIntent('buyer')}>Buyer</button>
                  <button type="button" className={clientIntent === 'seller' ? 'active' : ''} onClick={() => chooseIntent('seller')}>Seller</button>
                  <button type="button" className={clientIntent === 'researcher' ? 'active' : ''} onClick={() => chooseIntent('researcher')}>Explore</button>
                </div>
                <button type="button" className="back-to-reveal" onClick={() => setClientIntent(null)}>Change report</button>
              </div>
            </div>
            <div className="client-property-title">
              <div><p className="eyebrow">{reportTitle(clientIntent).toUpperCase()}</p><h1>{locatedProperty.address}</h1><p>{searchStatus}</p></div>
              <div className="client-proof-stack">
                <span>{locatedProperty.county ? `${locatedProperty.county} County` : 'Ohio'}</span>
                <span>{parcel ? 'Parcel matched' : 'Address matched'}</span>
                {valuation && <strong>{money(valuation.estimate)} <small>{clientIntent === 'seller' ? 'estimated center' : 'price context'}</small></strong>}
              </div>
            </div>
          </section>

          <nav className="client-room-nav five-part-nav" aria-label="ATLAS property report">
            {clientNav.map((item, index) => <button key={item} className={activeSection === item ? 'active' : ''} onClick={() => setActiveSection(item)}><i>{String(index + 1).padStart(2, '0')}</i><span>{item}</span></button>)}
          </nav>

          <AnimatePresence mode="wait">
            <motion.section key={`${clientIntent}-${activeSection}`} className="report-content client-room-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .3, ease: [0.22, 1, 0.36, 1] }}>
              {activeSection === 'Summary' && (
                <>
                  <section className="client-brief-intro"><div><span>{intentCopy.eyebrow}</span><h2>{intentCopy.title}</h2></div><p>{intentCopy.detail}</p></section>
                  <ClientDecisionGuide intent={clientIntent} parcelVerified={Boolean(parcel)} landReady={Boolean(intelligence)} marketReady={Boolean(researchProfile || valuation)} zoningKnown={Boolean(zoning)} acres={acres} onOpen={setActiveSection} />
                  <div className="client-brief-grid">{briefItems.map((item, index) => <motion.article key={`${item.label}-${index}`} className={item.tone === 'attention' ? 'client-brief-item attention' : 'client-brief-item'} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .06 }}><span>{item.label}</span><strong>{item.title}</strong><p>{item.detail}</p></motion.article>)}</div>
                  <section className="jacob-take"><div><span>JACOB'S TAKE</span><strong>{intentCopy.take}</strong></div><p>ATLAS should make the next question obvious. Mapped evidence is screening evidence; surveys, inspections, title work, permits, local rules and professional opinions still matter when the decision gets serious.</p></section>
                  <section className="summary-next-actions">
                    <button type="button" onClick={() => setActiveSection('Price')}><span>START WITH PRICE</span><strong>{clientIntent === 'seller' ? 'What might this property sell for?' : 'Does the price make sense?'}</strong></button>
                    <button type="button" onClick={() => setActiveSection('Property')}><span>UNDERSTAND THE PROPERTY</span><strong>See the parcel, land and possibilities.</strong></button>
                    <button type="button" onClick={() => setActiveSection('Research')}><span>CHECK THE UNKNOWNS</span><strong>See what still needs verified.</strong></button>
                  </section>
                </>
              )}

              {activeSection === 'Price' && (
                <div className="client-workspace money-workspace">
                  <div className="client-workspace-heading"><div><span>{clientIntent === 'seller' ? 'ESTIMATED MARKET RANGE' : 'PRICE CONTEXT'}</span><h2>{clientIntent === 'seller' ? 'What the market evidence currently supports.' : 'Does the asking price fit the evidence?'}</h2></div><p>Closed-market evidence carries the most weight. Automated estimates remain supporting evidence. County appraisal stays in tax context instead of pretending to be market value.</p></div>
                  {researchProfile ? <ResearchHomeValueSection profile={researchProfile} /> : <HomeValueSection parcelVerified={Boolean(parcel)} county={locatedProperty.county} record={countyRecord} />}
                  <details className="price-costs-drawer"><summary>Taxes & ownership-cost context</summary>{researchProfile ? <ResearchCostsSection profile={researchProfile} countyRecord={countyRecord} /> : <CostsSection county={locatedProperty.county} record={countyRecord} />}</details>
                </div>
              )}

              {activeSection === 'Homes' && <ComparableHomes profile={researchProfile} livingArea={livingArea} acres={acres} yearBuilt={yearBuilt} />}

              {activeSection === 'Property' && (
                <div className="client-workspace">
                  <div className="client-workspace-heading"><div><span>UNDERSTAND THE PROPERTY</span><h2>What are you actually buying—or selling?</h2></div><p>The property map is the evidence canvas. Aerial, parcel, terrain, soils, water, flood and wetlands stay together instead of becoming seven different pages.</p></div>
                  <PropertyMap property={locatedProperty} parcel={parcel} parcelVerified={Boolean(parcel)} />
                  <IntelligenceStrip intelligence={intelligence} loading={!intelligence} />
                  <div className="explore-two-up">
                    <article><span>HOME & SITE</span><strong>{livingArea ? `${bedrooms ?? '—'} bd · ${fullBaths ?? '—'} ba · ${livingArea.toLocaleString()} sf` : 'Home facts need verification'}</strong><p>{yearBuilt ? `Built ${yearBuilt}. ` : ''}{acres ? `${acres.toFixed(2)} acres. ` : ''}{zoning ? `${zoning} zoning reference.` : 'Local zoning still needs verification.'}</p></article>
                    <article><span>PLAIN ENGLISH FIRST</span><strong>Maps explain the property. They do not approve a use.</strong><p>ATLAS keeps the technical source underneath while the first layer tells you what the evidence may mean and what is still unknown.</p></article>
                  </div>
                  <details className="possibilities-drawer"><summary><span>IMAGINE THE POSSIBILITIES</span><strong>Could this property fit what I want to do?</strong><small>Open the concept planner</small></summary><PlanConfigurator property={locatedProperty} parcel={parcel} parcelVerified={Boolean(parcel)} intelligence={intelligence} acres={acres} zoningKnown={Boolean(zoning)} /></details>
                </div>
              )}

              {activeSection === 'Research' && (
                <div className="client-workspace research-workspace">
                  <PropertyResearch intelligence={intelligence} parcelVerified={Boolean(parcel)} acres={acres} zoning={zoning} county={locatedProperty.county} hasCauv={countyRecord ? countyRecord.hasCauv : null} />
                  <RisksSection intelligence={intelligence} county={locatedProperty.county} parcelVerified={Boolean(parcel)} />
                  <section className="client-evidence-drawer in-research">
                    <details>
                      <summary><span>Records, sources & methodology</span><small>Open the technical evidence</small></summary>
                      <div className="records-grid records-page-grid">
                        <div><span>Parcel ID</span><strong>{String(parcelId ?? 'Needs confirmation')}</strong></div>
                        <div><span>Zoning</span><strong>{zoning ?? 'Needs local confirmation'}</strong></div>
                        <div><span>County source</span><strong>{parcelProvider ?? countyRecord?.source ?? locatedProperty.source}</strong></div>
                        <div><span>County appraisal</span><strong>{money(countyRecord?.appraisedTotal)}</strong></div>
                        <div><span>Taxable assessment</span><strong>{money(countyRecord?.assessedTotal)}</strong></div>
                        <div><span>Research review</span><strong>{researchProfile ? dateLabel(researchProfile.reviewed_at) : 'No reviewed profile'}</strong></div>
                      </div>
                      {researchProfile?.sources?.length ? <div className="source-link-list">{researchProfile.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer"><span>{source.role || source.type}</span><strong>{source.name}</strong>↗</a>)}</div> : null}
                    </details>
                  </section>
                  <section className="contextual-client-cta">
                    <span>{clientIntent === 'seller' ? 'PUBLIC DATA HAS A LIMIT' : 'WHEN THE PROPERTY GETS SERIOUS'}</span>
                    <strong>{clientIntent === 'seller' ? 'ATLAS can show the record. A walkthrough is where the value gets tighter.' : clientIntent === 'researcher' ? 'Save the questions worth coming back to.' : 'Have Jacob look into the things the internet cannot settle.'}</strong>
                    <p>{clientIntent === 'seller' ? 'Condition, updates, drainage work, outbuildings and presentation can materially change how a buyer reacts to the property.' : 'The goal is not to create more homework. It is to identify the few questions that deserve a real answer before the decision.'}</p>
                  </section>
                </div>
              )}
            </motion.section>
          </AnimatePresence>

          <footer className="private-client-foot"><span>ATLAS by Holton Homes</span><p>Property intelligence is decision support, not a survey, appraisal, engineering opinion, title opinion, zoning approval, tax quote or inspection. Material questions should be verified with the appropriate official source or professional.</p></footer>
        </>
      ) : null}
    </main>
  )
}
