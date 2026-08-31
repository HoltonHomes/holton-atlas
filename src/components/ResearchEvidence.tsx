import { useState } from 'react'
import { motion } from 'motion/react'
import type { CountyPropertyRecord } from '../services/countyRecords'
import type { ResearchProfile } from '../services/researchProfile'
import { buildAtlasValuation } from '../services/valuationEngine'
import { atlasMotion, atlasReveal } from '../design/motion'
import MarketEvidenceChart from './charts/MarketEvidenceChart'
import ValueStory from './ValueStory'

type ValueIntent = 'buyer' | 'seller' | 'researcher'

function money(value: unknown) {
  const number = Number(value)
  if (!Number.isFinite(number) || number === 0) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(number)
}

function dateLabel(value: unknown) {
  if (typeof value !== 'string' || !value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

export function ResearchBadge({ profile }: { profile: ResearchProfile | null }) {
  if (!profile) return null
  const valuation = buildAtlasValuation(profile)
  return <span className={valuation ? 'research-badge value-badge' : 'research-badge'}>{valuation ? `ATLAS est. ${money(valuation.estimate)} · ${valuation.confidence}` : 'Research corroborated'}</span>
}

export function ResearchSourcePanel({ profile }: { profile: ResearchProfile }) {
  return (
    <section className="research-source-panel">
      <div><span className="card-kicker">SOURCE REVIEW</span><strong>{profile.sources.length} public sources compared</strong><p>Reviewed {dateLabel(profile.reviewed_at)}. ATLAS uses sources by field instead of treating any single site as universal truth.</p></div>
      <div className="research-source-links">{profile.sources.map((source) => <a key={`${source.name}-${source.url}`} href={source.url} target="_blank" rel="noreferrer">{source.name} ↗</a>)}</div>
    </section>
  )
}

function AtlasValuationCard({ profile }: { profile: ResearchProfile }) {
  const valuation = buildAtlasValuation(profile)
  if (!valuation) return null

  return (
    <section className="atlas-valuation-card">
      <div className="atlas-value-main">
        <div><span className="card-kicker">ATLAS CALCULATION</span><h3>{money(valuation.estimate)}</h3><p>Likely range <strong>{money(valuation.rangeLow)} – {money(valuation.rangeHigh)}</strong> · {valuation.confidence} internal confidence</p></div>
        <span className={`valuation-confidence ${valuation.confidence.toLowerCase()}`}>{valuation.confidence}</span>
      </div>
      <div className="valuation-evidence-grid">
        {valuation.evidence.map((row) => <article key={row.label}><div className="valuation-row-top"><span>{row.label}</span><strong>{Math.round(row.weight * 100)}%</strong></div><h4>{money(row.value)}</h4><div className="weight-track"><i style={{ width: `${Math.max(4, row.weight * 100)}%` }} /></div><p>{row.detail}</p></article>)}
      </div>
      <div className="valuation-method-note"><strong>How ATLAS weights value</strong><p>{valuation.note}</p>{valuation.marketTrendAnnualPct != null && valuation.subjectSaleOriginal && <p>The {money(valuation.subjectSaleOriginal)} subject closing is time-adjusted using the reviewed local quality-adjusted market trend ({valuation.marketTrendAnnualPct.toFixed(1)}% annual) to about {money(valuation.subjectSaleAdjusted)} before weighting.</p>}</div>
    </section>
  )
}

export function ResearchHomeValueSection({ profile, intent = 'researcher' }: { profile: ResearchProfile; intent?: ValueIntent }) {
  const facts = profile.facts ?? {}
  const home = facts.homeFacts ?? {}
  const valuationFacts = facts.valuation ?? {}
  const sale = facts.sale ?? {}
  const classification = facts.classification ?? {}
  const estimates = facts.thirdPartyValueEstimates ?? {}
  const atlasValuation = buildAtlasValuation(profile)

  return (
    <div className="data-section consumer-market-section">
      {atlasValuation && <ValueStory valuation={atlasValuation} profile={profile} intent={intent} />}

      <section className="market-fact-row">
        <article><span>THE HOME</span><strong>{home.livingAreaSqFt ? `${Number(home.livingAreaSqFt).toLocaleString()} sq ft` : 'Facts need verification'}</strong><p>{home.bedrooms ?? '—'} bd · {home.fullBathrooms ?? '—'} full ba · built {home.yearBuilt ?? '—'}{home.architecturalStyle ? ` · ${home.architecturalStyle}` : ''}</p></article>
        <article><span>LAST CLOSED SALE</span><strong>{money(sale.price)}</strong><p>{sale.mlsCloseDate ? `Closed ${dateLabel(sale.mlsCloseDate)}.` : 'Close date not verified.'} A real transaction is evidence; an appraisal amount is not assumed.</p></article>
        <article><span>COUNTY VALUE</span><strong>{money(valuationFacts.countyAppraisedValue)}</strong><p>Tax-administration context only. County appraisal receives 0% weight in the ATLAS market estimate.</p></article>
      </section>

      <details className="market-evidence-details">
        <summary><span>DEEPER MARKET EVIDENCE</span><strong>See the chart, weighting, source conflicts and outside estimates</strong></summary>
        <div className="market-evidence-detail-body">
          <AtlasValuationCard profile={profile} />
          {atlasValuation && <MarketEvidenceChart valuation={atlasValuation} />}
          <section className="evidence-conflict-card">
            <div className="conflict-heading"><span className="finding-status requires-verification">Source conflict</span><strong>Home classification</strong></div>
            <div className="conflict-columns"><div><span>MLS / listing description</span><strong>{classification.mlsDisplay ?? '—'}</strong></div><div><span>Public-record tax classification</span><strong>{classification.publicRecordDisplay ?? '—'}</strong></div></div>
            <p>{classification.note}</p>
          </section>
          <section className="estimate-band"><div><span className="card-kicker">RAW THIRD-PARTY AVMS · SUPPORTING EVIDENCE</span><h3>{money(estimates.zillow)} Zillow estimate</h3></div><div><span>Realtor.com valuation providers</span><strong>{Array.isArray(estimates.realtorProviders) ? `${money(Math.min(...estimates.realtorProviders))} – ${money(Math.max(...estimates.realtorProviders))}` : '—'}</strong></div></section>
          <ResearchSourcePanel profile={profile} />
        </div>
      </details>
    </div>
  )
}

export function ResearchCostsSection({ profile, countyRecord }: { profile: ResearchProfile; countyRecord: CountyPropertyRecord | null }) {
  const tax = profile.facts?.tax ?? {}
  const valuation = profile.facts?.valuation ?? {}
  const atlasValuation = buildAtlasValuation(profile)
  const annualTax = Number(tax.annualTaxPreferred) || 0
  const [mortgage, setMortgage] = useState('')
  const [insurance, setInsurance] = useState('')
  const [utilities, setUtilities] = useState('')
  const [maintenance, setMaintenance] = useState('')
  const inputNumber = (value: string) => Math.max(0, Number(value.replace(/[$,]/g, '')) || 0)
  const monthlyTax = annualTax / 12
  const monthlyTotal = monthlyTax + inputNumber(mortgage) + inputNumber(insurance) + inputNumber(utilities) + inputNumber(maintenance) / 12
  const maintenanceLow = atlasValuation ? atlasValuation.estimate * .005 : null
  const maintenanceHigh = atlasValuation ? atlasValuation.estimate * .01 : null

  return (
    <motion.div className="data-section" {...atlasReveal}>
      <div className="section-heading"><div><p className="eyebrow">TAXES & COSTS</p><h2>Understand the record first. Then build your budget.</h2></div><p>ATLAS separates what the public record says from what a future owner may actually pay. Blank costs stay excluded instead of being silently guessed.</p></div>
      <motion.aside className="tax-disclaimer-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: atlasMotion.duration.reveal, ease: atlasMotion.easing.enter }}><span className="card-kicker">IMPORTANT TAX CONTEXT</span><h3>{tax.taxYear ? `${tax.taxYear} public-record tax` : 'Public-record tax'}: {tax.annualTaxDisplay ?? money(tax.annualTaxPreferred)}</h3><p>This is a corroborated record/reference amount, not a quote of future taxes. A transfer, county reappraisal, new levies, exemptions, special assessments, CAUV or other agricultural treatment, and payment/escrow timing can change the amount billed to an owner.</p><small>For a purchase decision, verify the current parcel tax record and ask how ownership or use changes may affect future tax treatment.</small></motion.aside>
      <motion.section className="cost-planner" layout><div className="cost-total"><span>MONTHLY PLAN SO FAR</span><strong>{money(monthlyTotal)}</strong><small>Uses {money(monthlyTax)}/month only as a planning equivalent of the recorded annual tax—not as a prediction of a future escrow or tax bill.</small></div><div className="cost-input-grid"><label>Mortgage payment<input value={mortgage} onChange={(event) => setMortgage(event.target.value)} inputMode="decimal" placeholder="$ / month" /></label><label>Home insurance<input value={insurance} onChange={(event) => setInsurance(event.target.value)} inputMode="decimal" placeholder="$ / month" /></label><label>Utilities<input value={utilities} onChange={(event) => setUtilities(event.target.value)} inputMode="decimal" placeholder="$ / month" /></label><label>Maintenance plan<input value={maintenance} onChange={(event) => setMaintenance(event.target.value)} inputMode="decimal" placeholder="$ / year" /></label></div>{maintenanceLow != null && maintenanceHigh != null && <p className="planner-guidance">Planning reference only: 0.5%–1% of ATLAS estimated value is about <strong>{money(maintenanceLow)}–{money(maintenanceHigh)} per year</strong>. Actual upkeep depends on condition, systems, acreage and projects.</p>}</motion.section>
      <div className="cost-fact-grid"><motion.article whileHover={{ y: -3 }} transition={atlasMotion.spring.responsive}><span>{tax.taxYear ?? 'RECENT'} PUBLIC-RECORD TAX</span><strong>{tax.annualTaxDisplay ?? money(tax.annualTaxPreferred)}</strong><p>{tax.sourceCount ?? 'Multiple'} public sources corroborate this recorded amount. It is not a future-tax estimate.</p></motion.article><motion.article whileHover={{ y: -3 }} transition={atlasMotion.spring.responsive}><span>PLANNING EQUIVALENT</span><strong>{money(monthlyTax)}</strong><p>Recorded annual tax ÷ 12. Your actual tax installments or lender escrow can differ.</p></motion.article><motion.article whileHover={{ y: -3 }} transition={atlasMotion.spring.responsive}><span>CAUV / AGRICULTURAL TREATMENT</span><strong>{countyRecord ? (countyRecord.hasCauv ? 'Record indicates enrollment' : 'No enrollment shown') : 'Not verified'}</strong><p>Enrollment, continued eligibility and any recoupment exposure require county-level verification.</p></motion.article></div>
      <details className="tax-record-details"><summary>Technical tax record & limitations</summary><div><p><strong>{money(valuation.taxableAssessedValue)}</strong> taxable assessment · <strong>{money(valuation.countyAppraisedValue)}</strong> county appraisal.</p><p>These county valuation fields are tax-administration records, not ATLAS market value and not a guarantee of future taxes.</p><p>Withheld extract field: {money(tax.countyExtractCurrentTaxField)}. {tax.countyFieldStatus ?? 'Field semantics require verification before consumer display.'}</p></div></details>
      <ResearchSourcePanel profile={profile} />
    </motion.div>
  )
}
