import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { resolveCountyParcel, resolveOhioAddress } from './services/ohioProperty'
import type { LocatedProperty, ParcelFeature } from './services/ohioProperty'
import { getParcelIntelligence, getPropertyIntelligence, mergeParcelIntelligence } from './services/propertyIntelligence'
import type { PropertyIntelligence } from './services/propertyIntelligence'
import { getCountyPropertyRecord } from './services/countyRecords'
import type { CountyPropertyRecord } from './services/countyRecords'
import { getResearchProfile, researchNumber, researchText } from './services/researchProfile'
import type { ResearchProfile } from './services/researchProfile'
import { buildAtlasValuation } from './services/valuationEngine'
import { HomeValueSection, RisksSection, CostsSection } from './components/IntelligenceReport'
import { ResearchCostsSection, ResearchHomeValueSection } from './components/ResearchEvidence'
import PropertyMap from './components/PropertyMap'
import PlanConfigurator from './components/PlanConfigurator'
import ClientDecisionGuide from './components/ClientDecisionGuide'
import ComparableHomes from './components/ComparableHomes'
import PropertyResearch from './components/PropertyResearch'
import LandAtGlance from './components/LandAtGlance'
import PropertyStudio from './components/PropertyStudio'
import HomeownerOverview from './components/HomeownerOverview'

type ClientIntent = 'buyer' | 'seller' | 'researcher'
type ClientSection = 'Insight' | 'Home' | 'Land' | 'Reality' | 'WorkFor'
type VisitorPath = 'understand' | 'value'

const CLIENT_SECTIONS: Array<{ key: ClientSection; label: string }> = [
  { key: 'Insight', label: 'ATLAS Insight' },
  { key: 'Home', label: 'The Home' },
  { key: 'Land', label: 'The Land' },
  { key: 'Reality', label: 'The Reality Check' },
  { key: 'WorkFor', label: 'What It Could Work For' },
]

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
  const [activeSection, setActiveSection] = useState<ClientSection>('Insight')
  const [clientIntent, setClientIntent] = useState<ClientIntent | null>(null)
  const [visitorPath, setVisitorPath] = useState<VisitorPath | null>(null)
  const hasProperty = Boolean(locatedProperty)

  function chooseIntent(intent: ClientIntent) {
    setClientIntent(intent)
    setActiveSection('Insight')
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
    setActiveSection('Insight')
    setSearchStatus('Finding the property and assembling the evidence…')

    try {
      const property = await resolveOhioAddress(query)
      if (!property) {
        setLocatedProperty(null)
        setSearchStatus('No confident Ohio address match found. Try the full street address, city and ZIP.')
        return
      }

      setLocatedProperty(property)
      if (visitorPath === 'value') setClientIntent('seller')
      const [pointIntelligence, parcelData, nextCountyRecord, nextResearchProfile] = await Promise.all([
        getPropertyIntelligence(property.longitude, property.latitude),
        property.county ? resolveCountyParcel(property.county, property.longitude, property.latitude) : Promise.resolve(null),
        getCountyPropertyRecord(property.county, property.address).catch(() => null),
        getResearchProfile(property.address).catch(() => null),
      ])

      setCountyRecord(nextCountyRecord)
      setResearchProfile(nextResearchProfile)

      let nextIntelligence = pointIntelligence
      let parcelScreened = false
      if (parcelData?.supported && parcelData.parcel && !parcelData.error) {
        setParcel(parcelData.parcel)
        setParcelProvider(parcelData.provider ?? `${property.county} County GIS`)
        setSearchStatus('Property found · screening the full parcel against land and environmental evidence…')
        const parcelAnalysis = await getParcelIntelligence(parcelData.parcel)
        nextIntelligence = mergeParcelIntelligence(pointIntelligence, parcelAnalysis)
        parcelScreened = Boolean(parcelAnalysis)
      }
      setIntelligence(nextIntelligence)

      if (nextResearchProfile && parcelScreened) setSearchStatus('Property found · market evidence and parcel-wide land screening assembled.')
      else if (nextResearchProfile) setSearchStatus('Property found · market, property and point-level land evidence assembled.')
      else if (parcelData?.parcel && parcelScreened) setSearchStatus('Property found · parcel-wide land screening assembled; market research is still limited.')
      else if (parcelData?.parcel) setSearchStatus('Property found · parcel matched; some land sources still require verification.')
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
  const salePrice = researchNumber(researchProfile, ['sale', 'price']) ?? countyRecord?.salePrice ?? valuation?.subjectSaleOriginal ?? null
  const annualTaxDisplay = researchText(researchProfile, ['tax', 'annualTaxDisplay']) ?? (countyRecord?.currentTax ? money(countyRecord.currentTax) : null)
  const classificationMls = researchText(researchProfile, ['classification', 'mlsDisplay'])
  const classificationPublic = researchText(researchProfile, ['classification', 'publicRecordDisplay']) ?? countyRecord?.class ?? countyRecord?.landUse ?? null

  const briefItems = useMemo(() => {
    const rows: Array<{ label: string; title: string; detail: string; tone?: string }> = []
    if (valuation) rows.push({ label: clientIntent === 'seller' ? 'Estimated market range' : 'Price context', title: `${money(valuation.rangeLow)}–${money(valuation.rangeHigh)}`, detail: `${money(valuation.estimate)} current ATLAS center · ${valuation.confidence} evidence.` })
    if (acres) rows.push({ label: 'Land', title: `${acres.toFixed(2)} acres`, detail: intelligence?.parcelAnalysis ? 'ATLAS matched the parcel and completed parcel-wide land screening.' : parcel ? 'Recorded parcel geometry is available for map-based review.' : 'Recorded acreage is available; parcel geometry still needs verification.' })
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
    <main className={hasProperty ? `site-shell client-atlas room-${activeSection.toLowerCase()}` : 'site-shell'}>
      <nav className="nav-shell client-brandbar" aria-label="Primary navigation">
        <a className="brand" href="/" aria-label="ATLAS home"><span className="brand-mark">A</span><span><strong>ATLAS</strong><small>by Holton Homes</small></span></a>
        <span className="nav-status">Property Intelligence by Holton Homes</span>
      </nav>

      {!hasProperty ? (
        visitorPath === null ? (
          <section className="hero landing-hero path-landing">
            <div className="path-landing-intro">
              <p className="eyebrow">HOLTON HOMES · PROPERTY INTELLIGENCE</p>
              <h1>What are you trying to figure out?</h1>
              <p className="lede">Start with the question, not the category. ATLAS brings the same evidence either way — it just leads with what matters to you first.</p>
            </div>
            <div className="path-choice-grid">
              <button type="button" className="path-choice-card" onClick={() => setVisitorPath('understand')}>
                <span>UNDERSTAND A PROPERTY</span>
                <strong>Enter an address and open ATLAS.</strong>
                <p>The home, the land, the reality check, and what it could work for — before you fall in love with the listing photos.</p>
                <b>Research a property →</b>
              </button>
              <button type="button" className="path-choice-card" onClick={() => setVisitorPath('value')}>
                <span>FIGURE OUT WHAT MY HOME IS WORTH</span>
                <strong>See value, comps, equity, and local activity.</strong>
                <p>An evidence-backed range and your equity position — not one confident-looking automated number.</p>
                <b>Check my home's value →</b>
              </button>
            </div>
          </section>
        ) : (
          <section className="hero landing-hero private-landing report-first-landing">
            <div className="hero-copy">
              <button type="button" className="path-back" onClick={() => setVisitorPath(null)}>← Change what you're trying to figure out</button>
              <p className="eyebrow">{visitorPath === 'value' ? 'HOME VALUE' : 'HOLTON HOMES · PROPERTY INTELLIGENCE'}</p>
              <h1>{visitorPath === 'value' ? 'What is your home actually worth?' : 'Research any home.'}</h1>
              <p className="lede">{visitorPath === 'value' ? 'Enter your address. ATLAS builds a value range from real evidence — comps, market activity and your equity — instead of a single guess.' : 'Understand the house, the price, the land, and what matters before your next move.'}</p>
              <form className="search-card" onSubmit={handleSubmit}>
                <label htmlFor="property-address">Enter a property address</label>
                <div className="search-row"><input id="property-address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Enter an Ohio property address" autoComplete="street-address" /><button type="submit" disabled={isSearching}>{isSearching ? 'Researching…' : visitorPath === 'value' ? 'See my value' : 'Research this property'}</button></div>
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
        )
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
                <span>{intelligence?.parcelAnalysis ? 'Parcel-wide screen complete' : parcel ? 'Parcel matched' : 'Address matched'}</span>
                {valuation && <strong>{money(valuation.estimate)} <small>{clientIntent === 'seller' ? 'estimated center' : 'price context'}</small></strong>}
              </div>
            </div>
          </section>

          <nav className="client-room-nav five-part-nav" aria-label="ATLAS property room">
            {CLIENT_SECTIONS.map((item, index) => <button key={item.key} className={activeSection === item.key ? 'active' : ''} onClick={() => setActiveSection(item.key)}><i>{String(index + 1).padStart(2, '0')}</i><span>{item.label}</span></button>)}
          </nav>

          <AnimatePresence mode="wait">
            <motion.section key={`${clientIntent}-${activeSection}`} className="report-content client-room-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .3, ease: [0.22, 1, 0.36, 1] }}>
              {activeSection === 'Insight' && (
                <>
                  <section className="client-brief-intro"><div><span>{intentCopy.eyebrow}</span><h2>{intentCopy.title}</h2></div><p>{intentCopy.detail}</p></section>
                  <ClientDecisionGuide intent={clientIntent} parcelVerified={Boolean(parcel)} landReady={Boolean(intelligence)} marketReady={Boolean(researchProfile || valuation)} zoningKnown={Boolean(zoning)} acres={acres} onOpen={setActiveSection} />
                  {clientIntent === 'seller' ? (
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
                      onOpenValue={() => setActiveSection('Reality')}
                      onOpenLand={() => setActiveSection('Land')}
                      onOpenRisks={() => setActiveSection('Reality')}
                    />
                  ) : (
                    <div className="client-brief-grid">{briefItems.slice(0, 4).map((item, index) => <motion.article key={`${item.label}-${index}`} className={item.tone === 'attention' ? 'client-brief-item attention' : 'client-brief-item'} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .06 }}><span>{item.label}</span><strong>{item.title}</strong><p>{item.detail}</p></motion.article>)}</div>
                  )}
                  <section className="jacob-take"><div><span>JACOB'S TAKE</span><strong>{intentCopy.take}</strong></div><p>ATLAS should make the next question obvious. Mapped evidence is screening evidence; surveys, inspections, title work, permits, local rules and professional opinions still matter when the decision gets serious.</p></section>
                </>
              )}

              {activeSection === 'Home' && (
                <div className="client-workspace home-workspace">
                  <div className="client-workspace-heading"><div><span>THE HOME</span><h2>What's actually here.</h2></div><p>Core facts and how the listing description compares with the public record — before beds and baths turn into a story.</p></div>
                  <div className="home-fact-hero">
                    <div className="home-fact-map"><PropertyMap property={locatedProperty} parcel={parcel} parcelVerified={Boolean(parcel)} compact /></div>
                    <div className="home-fact-grid">
                      <article><span>Bedrooms</span><strong>{bedrooms ?? '—'}</strong></article>
                      <article><span>Full baths</span><strong>{fullBaths ?? '—'}</strong></article>
                      <article><span>Living area</span><strong>{livingArea ? `${livingArea.toLocaleString()} sf` : '—'}</strong></article>
                      <article><span>Year built</span><strong>{yearBuilt ?? '—'}</strong></article>
                      <article><span>Lot size</span><strong>{acres ? `${acres.toFixed(2)} acres` : '—'}</strong></article>
                      <article><span>Last recorded sale</span><strong>{salePrice ? money(salePrice) : '—'}</strong></article>
                    </div>
                  </div>
                  <div className="explore-two-up">
                    <article><span>CLASSIFICATION</span><strong>{classificationMls ?? classificationPublic ?? 'Needs verification'}</strong><p>{classificationMls && classificationPublic && classificationMls !== classificationPublic ? `The listing describes it as "${classificationMls}" while the public tax record shows "${classificationPublic}." ATLAS keeps both visible instead of picking one.` : 'How the home is described and how the county classifies it for tax purposes.'}</p></article>
                    <article><span>PARCEL RECORD</span><strong>{String(parcelId ?? 'Needs confirmation')}</strong><p>{locatedProperty.county ? `${locatedProperty.county} County` : 'Ohio'} record{parcelProvider ? ` · ${parcelProvider}` : ''}.</p></article>
                  </div>
                </div>
              )}

              {activeSection === 'Land' && (
                <div className="client-workspace property-workspace">
                  <div className="client-workspace-heading"><div><span>THE LAND</span><h2>Acreage, terrain and what's actually on the ground.</h2></div><p>Parcel shape, road frontage, wooded/open land, water and mapped constraints — screening evidence, not a survey.</p></div>
                  <PropertyStudio property={locatedProperty} parcel={parcel} parcelVerified={Boolean(parcel)} intelligence={intelligence} acres={acres} onOpenPlan={() => setActiveSection('WorkFor')} />
                  <LandAtGlance intelligence={intelligence} />
                  <div className="explore-two-up">
                    <article><span>ZONING REFERENCE</span><strong>{zoning ?? 'Needs local confirmation'}</strong><p>{zoning ? `${zoning} zoning reference found. This does not settle a specific proposed use.` : 'Local zoning still needs verification with the applicable jurisdiction.'}</p></article>
                    <article><span>{intelligence?.parcelAnalysis ? 'PARCEL-WIDE SCREEN' : 'SCREENING LEVEL'}</span><strong>{intelligence?.parcelAnalysis ? 'ATLAS checked the parcel—not only the address point.' : 'Some environmental evidence is still point-level.'}</strong><p>{intelligence?.parcelAnalysis ? `Flood, wetlands and soil findings reflect the recorded parcel${intelligence.parcelAnalysis.slope ? '; terrain is sampled across it' : ''}${intelligence.parcelAnalysis.water ? '; mapped surface water is included' : ''}.` : 'ATLAS keeps the technical source underneath while showing exactly where the current evidence stops.'}</p></article>
                  </div>
                </div>
              )}

              {activeSection === 'WorkFor' && (
                <div className="client-workspace plan-room-workspace">
                  <div className="client-workspace-heading"><div><span>WHAT IT COULD WORK FOR</span><h2>What could this property work for?</h2></div><p>Garden, chickens, goats, horses, a workshop, a barn, homestead potential — choose a use and ATLAS separates what the evidence supports from what still needs checked.</p></div>
                  <PlanConfigurator property={locatedProperty} parcel={parcel} parcelVerified={Boolean(parcel)} intelligence={intelligence} acres={acres} zoningKnown={Boolean(zoning)} />
                </div>
              )}

              {activeSection === 'Reality' && (
                <div className="client-workspace research-workspace">
                  <div className="client-workspace-heading"><div><span>THE REALITY CHECK</span><h2>Taxes, estimated cost and what still needs verifying.</h2></div><p>Closed-market evidence carries the most weight in price. Flood, soil, septic and zoning stay separated into public record, mapped evidence and open questions.</p></div>
                  {researchProfile ? <ResearchHomeValueSection profile={researchProfile} intent={clientIntent} /> : <HomeValueSection parcelVerified={Boolean(parcel)} county={locatedProperty.county} record={countyRecord} />}
                  <ComparableHomes profile={researchProfile} livingArea={livingArea} acres={acres} yearBuilt={yearBuilt} />
                  <details className="price-costs-drawer"><summary>Taxes & ownership-cost context</summary>{researchProfile ? <ResearchCostsSection profile={researchProfile} countyRecord={countyRecord} /> : <CostsSection county={locatedProperty.county} record={countyRecord} />}</details>
                  <RisksSection intelligence={intelligence} county={locatedProperty.county} parcelVerified={Boolean(parcel)} />
                  <PropertyResearch intelligence={intelligence} parcelVerified={Boolean(parcel)} acres={acres} zoning={zoning} county={locatedProperty.county} hasCauv={countyRecord ? countyRecord.hasCauv : null} />
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
