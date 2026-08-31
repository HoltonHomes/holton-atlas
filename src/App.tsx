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
import HomeownerOverview from './components/HomeownerOverview'
import ClientDecisionGuide from './components/ClientDecisionGuide'

const clientNav = ['Brief', 'Explore', 'Plan', 'Money'] as const
type ClientSection = typeof clientNav[number]
type ClientIntent = 'buyer' | 'seller'

const clientNavLabels: Record<ClientIntent, Record<ClientSection, string>> = {
  buyer: { Brief: 'Brief', Explore: 'Explore', Plan: 'Plan', Money: 'Money' },
  seller: { Brief: 'Brief', Explore: 'Property', Plan: 'Strategy', Money: 'Value' },
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
  const [clientIntent, setClientIntent] = useState<ClientIntent>('buyer')
  const hasProperty = Boolean(locatedProperty)

  function chooseIntent(intent: ClientIntent) {
    setClientIntent(intent)
    setActiveSection('Brief')
  }

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
    setSearchStatus(clientIntent === 'buyer' ? 'Building your buyer property brief…' : 'Building your seller property brief…')

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
    if (valuation) rows.push({ label: clientIntent === 'buyer' ? 'Price context' : 'Market position', title: `${money(valuation.estimate)} ATLAS estimate`, detail: `${money(valuation.rangeLow)}–${money(valuation.rangeHigh)} likely range · ${valuation.confidence} confidence.` })
    if (acres) rows.push({ label: 'Land', title: `${acres.toFixed(2)} acres`, detail: parcel ? 'Parcel geometry is available for map-based review.' : 'Recorded acreage is available; parcel geometry still needs verification.' })
    if (intelligence?.flood) rows.push({ label: 'Due diligence', title: intelligence.flood.value, detail: intelligence.flood.detail, tone: intelligence.flood.status === 'Problem' ? 'attention' : undefined })
    if (intelligence?.wetlands) rows.push({ label: 'Land signal', title: intelligence.wetlands.value, detail: intelligence.wetlands.detail })
    if (zoning) rows.push({ label: 'Local rules', title: zoning, detail: 'Zoning is a starting point; proposed uses still need local verification.' })
    return rows.slice(0, 5)
  }, [valuation, acres, parcel, intelligence, zoning, clientIntent])

  const landingCopy = clientIntent === 'buyer'
    ? {
        eyebrow: 'HOLTON HOMES · BUYER PROPERTY INTELLIGENCE',
        title: 'Love the house. Understand the property.',
        lede: 'Open a private ATLAS room before you get emotionally committed. See the land, value evidence, risks, possibilities and the questions worth asking next.',
        label: 'Research a property you are considering',
        asideTitle: 'From “I like it” to “I understand it.”',
        asideBody: 'ATLAS guides the review instead of dumping a pile of records on you. Property context first, technical evidence underneath.',
      }
    : {
        eyebrow: 'HOLTON HOMES · SELLER PROPERTY INTELLIGENCE',
        title: 'Understand your property before you decide to sell it.',
        lede: 'Open a private ATLAS room to review market evidence, land context, buyer-facing questions, recorded taxes and the parts of the property that may shape your selling strategy.',
        label: 'Research a property you own',
        asideTitle: 'A selling decision should start with the whole property.',
        asideBody: 'ATLAS brings value, property context and likely buyer questions together before you decide what to improve, explain or list.',
      }

  return (
    <main className={hasProperty ? 'site-shell client-atlas' : 'site-shell'}>
      <nav className="nav-shell client-brandbar" aria-label="Primary navigation">
        <a className="brand" href="/" aria-label="ATLAS home"><span className="brand-mark">A</span><span><strong>ATLAS</strong><small>by Holton Homes</small></span></a>
        <span className="nav-status">Private Client Intelligence</span>
      </nav>

      {!hasProperty ? (
        <section className="hero landing-hero private-landing">
          <div className="hero-copy">
            <p className="eyebrow">{landingCopy.eyebrow}</p>
            <h1>{landingCopy.title}</h1>
            <p className="lede">{landingCopy.lede}</p>

            <div className="client-intent-switch" aria-label="Choose buyer or seller experience">
              <button type="button" className={clientIntent === 'buyer' ? 'active' : ''} onClick={() => chooseIntent('buyer')}>
                <span>I am considering buying</span><small>Research a property before the decision</small>
              </button>
              <button type="button" className={clientIntent === 'seller' ? 'active' : ''} onClick={() => chooseIntent('seller')}>
                <span>I own or may sell</span><small>Understand value and selling strategy</small>
              </button>
            </div>

            <form className="search-card" onSubmit={handleSubmit}>
              <label htmlFor="property-address">{landingCopy.label}</label>
              <div className="search-row"><input id="property-address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Enter an Ohio property address" autoComplete="street-address" /><button type="submit" disabled={isSearching}>{isSearching ? 'Building brief…' : 'Open ATLAS'}</button></div>
              <p className={searchStatus ? 'search-status active' : 'search-status'}>{searchStatus || 'Client access combines public records, mapped evidence and Holton Homes analysis in one guided property room.'}</p>
            </form>
          </div>
          <aside className="private-access-card">
            <span>{clientIntent === 'buyer' ? 'BUYER CLIENT ACCESS' : 'SELLER CLIENT ACCESS'}</span>
            <strong>{landingCopy.asideTitle}</strong>
            <p>{landingCopy.asideBody}</p>
            <div><b>Prepared with Holton Homes</b><small>Evidence first · conclusions explained · unknowns stay visible</small></div>
          </aside>
        </section>
      ) : locatedProperty ? (
        <>
          <section className="client-property-masthead">
            <div className="client-property-topline">
              <div><span>PRIVATE PROPERTY ROOM</span><strong>Prepared by Jacob Holton · Holton Homes</strong></div>
              <div className="property-room-actions">
                <div className="room-intent-switch" aria-label="Property room mode">
                  <button type="button" className={clientIntent === 'buyer' ? 'active' : ''} onClick={() => chooseIntent('buyer')}>Buyer</button>
                  <button type="button" className={clientIntent === 'seller' ? 'active' : ''} onClick={() => chooseIntent('seller')}>Seller</button>
                </div>
                <form className="compact-search" onSubmit={handleSubmit}><input value={address} onChange={(event) => setAddress(event.target.value)} aria-label="Search another property" /><button type="submit" disabled={isSearching}>{isSearching ? 'Building…' : 'Open another'}</button></form>
              </div>
            </div>
            <div className="client-property-title">
              <div>
                <p className="eyebrow">{clientIntent === 'buyer' ? 'YOUR BUYER ATLAS BRIEF' : 'YOUR SELLER ATLAS BRIEF'}</p>
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
            {clientNav.map((item, index) => (
              <button key={item} className={activeSection === item ? 'active' : ''} onClick={() => setActiveSection(item)}>
                <i>{String(index + 1).padStart(2, '0')}</i><span>{clientNavLabels[clientIntent][item]}</span>
              </button>
            ))}
          </nav>

          <AnimatePresence mode="wait">
            <motion.section key={`${clientIntent}-${activeSection}`} className="report-content client-room-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .3, ease: [0.22, 1, 0.36, 1] }}>
              {activeSection === 'Brief' && (
                <>
                  <section className="client-brief-intro">
                    <div><span>{clientIntent === 'buyer' ? 'WHAT MATTERS BEFORE THE DECISION' : 'WHAT MATTERS BEFORE YOU LIST'}</span><h2>{clientIntent === 'buyer' ? 'The short version before the rabbit hole.' : 'The whole-property view before the pricing conversation.'}</h2></div>
                    <p>{clientIntent === 'buyer' ? 'ATLAS brings forward the evidence most likely to change whether you pursue, price, inspect or walk away from a property.' : 'ATLAS starts with evidence about value, land and buyer-facing questions so selling strategy is not reduced to one automated estimate.'}</p>
                  </section>

                  <ClientDecisionGuide
                    intent={clientIntent}
                    parcelVerified={Boolean(parcel)}
                    landReady={Boolean(intelligence)}
                    marketReady={Boolean(researchProfile || valuation)}
                    zoningKnown={Boolean(zoning)}
                    acres={acres}
                    onOpen={setActiveSection}
                  />

                  <div className="client-brief-grid">
                    {briefItems.map((item, index) => <motion.article key={`${item.label}-${index}`} className={item.tone === 'attention' ? 'client-brief-item attention' : 'client-brief-item'} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .06 }}><span>{item.label}</span><strong>{item.title}</strong><p>{item.detail}</p></motion.article>)}
                  </div>

                  <section className="jacob-take">
                    <div><span>JACOB'S TAKE</span><strong>{clientIntent === 'buyer' ? 'Do not decide from the listing. Decide from the property.' : 'Do not price the house in isolation. Position the property buyers will actually experience.'}</strong></div>
                    <p>{clientIntent === 'buyer' ? 'ATLAS is designed to surface the things I would want us to understand before you become attached to a property. The map and automated findings are screening evidence; surveys, inspections, permits, local rules and professional opinions still matter when the decision gets serious.' : 'ATLAS helps separate a strong selling point from a question that needs verification before it becomes a buyer objection. The goal is a cleaner pricing and preparation conversation, not artificial certainty.'}</p>
                  </section>

                  {clientIntent === 'seller' ? (
                    <HomeownerOverview researchProfile={researchProfile} intelligence={intelligence} countyRecord={countyRecord} acres={acres} livingArea={livingArea} bedrooms={bedrooms} baths={fullBaths} salePrice={salePrice} annualTaxDisplay={annualTaxDisplay} parcelId={parcelId} zoning={zoning} classificationMls={classificationMls} classificationPublic={classificationPublic} onOpenValue={() => setActiveSection('Money')} onOpenLand={() => setActiveSection('Explore')} onOpenRisks={() => setActiveSection('Explore')} />
                  ) : (
                    <section className="buyer-brief-next">
                      <div><span>YOUR NEXT 10 MINUTES</span><strong>Explore the parcel before you build a story about the property.</strong><p>Start with aerial and terrain, then turn on the layers that answer the question you actually care about: water, soils, slope, flood, wetlands or usable space.</p></div>
                      <div className="buyer-next-actions"><button type="button" onClick={() => setActiveSection('Explore')}>Open the property map</button><button type="button" onClick={() => setActiveSection('Plan')}>Test what I could do here</button></div>
                    </section>
                  )}
                </>
              )}

              {activeSection === 'Explore' && (
                <div className="client-workspace">
                  <div className="client-workspace-heading"><span>{clientIntent === 'buyer' ? 'EXPLORE THE PROPERTY' : 'UNDERSTAND THE PROPERTY'}</span><h2>{clientIntent === 'buyer' ? 'One map. Every useful layer.' : 'See the property through a buyer’s eyes.'}</h2><p>{clientIntent === 'buyer' ? 'Move through aerial, terrain, soil, water, flood and wetlands without leaving the property room.' : 'Use the same parcel, land and risk evidence a serious buyer may care about, then decide what deserves explanation or verification before listing.'}</p></div>
                  <PropertyMap property={locatedProperty} parcel={parcel} parcelVerified={Boolean(parcel)} />
                  <IntelligenceStrip intelligence={intelligence} loading={!intelligence} />
                  <div className="explore-two-up">
                    <article><span>HOME & SITE</span><strong>{livingArea ? `${bedrooms ?? '—'} bd · ${fullBaths ?? '—'} ba · ${livingArea.toLocaleString()} sf` : 'Home facts need verification'}</strong><p>{yearBuilt ? `Built ${yearBuilt}. ` : ''}{acres ? `${acres.toFixed(2)} acres. ` : ''}{zoning ? `${zoning} zoning reference.` : 'Local zoning still needs verification.'}</p></article>
                    <article><span>{clientIntent === 'buyer' ? 'WHAT TO VERIFY NEXT' : 'WHAT A BUYER MAY ASK NEXT'}</span><strong>Use the map as a screening tool.</strong><p>Flood, wetlands, soils and terrain can change how land feels and functions. Local rules, septic, access, easements and permits still require source-level verification.</p></article>
                  </div>
                  <RisksSection intelligence={intelligence} county={locatedProperty.county} parcelVerified={Boolean(parcel)} />
                </div>
              )}

              {activeSection === 'Plan' && (
                <PlanConfigurator
                  property={locatedProperty}
                  parcel={parcel}
                  parcelVerified={Boolean(parcel)}
                  intelligence={intelligence}
                  acres={acres}
                  zoningKnown={Boolean(zoning)}
                />
              )}

              {activeSection === 'Money' && (
                <div className="client-workspace money-workspace">
                  <div className="client-workspace-heading"><span>{clientIntent === 'buyer' ? 'MONEY' : 'VALUE & SELLING CONTEXT'}</span><h2>{clientIntent === 'buyer' ? 'Value, taxes and what ownership may cost.' : 'What the evidence says the property may be worth—and what the record does not guarantee.'}</h2><p>{clientIntent === 'buyer' ? 'Market evidence and public tax records are kept separate so historical tax data is never presented like a guaranteed future bill.' : 'ATLAS keeps market evidence, county valuation and recorded taxes separate so pricing decisions are not built on labels that mean different things.'}</p></div>
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
