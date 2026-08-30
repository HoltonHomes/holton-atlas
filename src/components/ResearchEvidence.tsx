import type { CountyPropertyRecord } from '../services/countyRecords'
import type { ResearchProfile } from '../services/researchProfile'
import { buildAtlasValuation } from '../services/valuationEngine'

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
  return (
    <span className={valuation ? 'research-badge value-badge' : 'research-badge'}>
      {valuation ? `ATLAS est. ${money(valuation.estimate)} · ${valuation.confidence}` : 'Research corroborated'}
    </span>
  )
}

export function ResearchSourcePanel({ profile }: { profile: ResearchProfile }) {
  return (
    <section className="research-source-panel">
      <div>
        <span className="card-kicker">SOURCE REVIEW</span>
        <strong>{profile.sources.length} public sources compared</strong>
        <p>Reviewed {dateLabel(profile.reviewed_at)}. ATLAS uses sources by field instead of treating any single site as universal truth.</p>
      </div>
      <div className="research-source-links">
        {profile.sources.map((source) => (
          <a key={`${source.name}-${source.url}`} href={source.url} target="_blank" rel="noreferrer">{source.name} ↗</a>
        ))}
      </div>
    </section>
  )
}

function AtlasValuationCard({ profile }: { profile: ResearchProfile }) {
  const valuation = buildAtlasValuation(profile)
  if (!valuation) return null

  return (
    <section className="atlas-valuation-card">
      <div className="atlas-value-main">
        <div>
          <span className="card-kicker">ATLAS ESTIMATED MARKET VALUE</span>
          <h3>{money(valuation.estimate)}</h3>
          <p>Likely range <strong>{money(valuation.rangeLow)} – {money(valuation.rangeHigh)}</strong> · {valuation.confidence} confidence</p>
        </div>
        <span className={`valuation-confidence ${valuation.confidence.toLowerCase()}`}>{valuation.confidence}</span>
      </div>

      <div className="valuation-evidence-grid">
        {valuation.evidence.map((row) => (
          <article key={row.label}>
            <div className="valuation-row-top"><span>{row.label}</span><strong>{Math.round(row.weight * 100)}%</strong></div>
            <h4>{money(row.value)}</h4>
            <div className="weight-track"><i style={{ width: `${Math.max(4, row.weight * 100)}%` }} /></div>
            <p>{row.detail}</p>
          </article>
        ))}
      </div>

      <div className="valuation-method-note">
        <strong>How ATLAS weights value</strong>
        <p>{valuation.note}</p>
        {valuation.marketTrendAnnualPct != null && valuation.subjectSaleOriginal && (
          <p>The {money(valuation.subjectSaleOriginal)} subject closing is time-adjusted using the reviewed local quality-adjusted trend ({valuation.marketTrendAnnualPct.toFixed(1)}% annual) to about {money(valuation.subjectSaleAdjusted)} before weighting.</p>
        )}
      </div>
    </section>
  )
}

export function ResearchHomeValueSection({ profile }: { profile: ResearchProfile }) {
  const facts = profile.facts ?? {}
  const home = facts.homeFacts ?? {}
  const valuation = facts.valuation ?? {}
  const sale = facts.sale ?? {}
  const classification = facts.classification ?? {}
  const estimates = facts.thirdPartyValueEstimates ?? {}

  return (
    <div className="data-section">
      <div className="section-heading">
        <div><p className="eyebrow">HOME & VALUE</p><h2>Market evidence, weighted by what it actually proves.</h2></div>
        <p>A real closed sale outranks an AVM. Recent comparable closings update the anchor. Automated estimates are supporting evidence. County appraisal stays in the tax context and receives no market-value weight.</p>
      </div>

      <AtlasValuationCard profile={profile} />

      <div className="source-plan-grid researched-fact-grid">
        <article className="intel-card">
          <span className="card-kicker">CORROBORATED HOME FACTS</span>
          <h3>{home.livingAreaSqFt ? `${Number(home.livingAreaSqFt).toLocaleString()} sq ft` : 'Home facts'}</h3>
          <p>{home.bedrooms ?? '—'} bedrooms · {home.fullBathrooms ?? '—'} full baths · built {home.yearBuilt ?? '—'} · {home.stories ?? '—'} story · {home.architecturalStyle ?? 'style not confirmed'}.</p>
          <span className="evidence-line">{home.sourceCount ?? 'Multiple'} sources agree · {home.confidence ?? 'High'} confidence</span>
        </article>

        <article className="intel-card">
          <span className="card-kicker">COUNTY VALUES · NOT MARKET WEIGHT</span>
          <h3>{money(valuation.countyAppraisedValue)}</h3>
          <p>County appraised value. Taxable assessed value: {money(valuation.taxableAssessedValue)}. Land: {money(valuation.assessedLand)} · improvements: {money(valuation.assessedImprovements)}.</p>
          <span className="evidence-line">Useful for taxes. 0% weight in the ATLAS market estimate.</span>
        </article>

        <article className="intel-card">
          <span className="card-kicker">LAST CLOSED SUBJECT SALE</span>
          <h3>{money(sale.price)}</h3>
          <p>MLS close: {dateLabel(sale.mlsCloseDate)}. Public-record transfer: {dateLabel(sale.publicRecordTransferDate)}.</p>
          <span className="evidence-line">Observed market transaction; appraisal amount/status is not assumed.</span>
        </article>
      </div>

      <section className="evidence-conflict-card">
        <div className="conflict-heading"><span className="finding-status requires-verification">Source conflict</span><strong>Home classification</strong></div>
        <div className="conflict-columns">
          <div><span>MLS / listing description</span><strong>{classification.mlsDisplay ?? '—'}</strong></div>
          <div><span>Public-record tax classification</span><strong>{classification.publicRecordDisplay ?? '—'}</strong></div>
        </div>
        <p>{classification.note}</p>
      </section>

      <section className="estimate-band">
        <div><span className="card-kicker">RAW THIRD-PARTY AVMS · SUPPORTING EVIDENCE</span><h3>{money(estimates.zillow)} Zillow estimate</h3></div>
        <div><span>Realtor.com valuation providers</span><strong>{Array.isArray(estimates.realtorProviders) ? `${money(Math.min(...estimates.realtorProviders))} – ${money(Math.max(...estimates.realtorProviders))}` : '—'}</strong></div>
      </section>

      <ResearchSourcePanel profile={profile} />
    </div>
  )
}

export function ResearchCostsSection({ profile, countyRecord }: { profile: ResearchProfile; countyRecord: CountyPropertyRecord | null }) {
  const tax = profile.facts?.tax ?? {}
  const valuation = profile.facts?.valuation ?? {}

  return (
    <div className="data-section">
      <div className="section-heading">
        <div><p className="eyebrow">COSTS</p><h2>Use the right tax number.</h2></div>
        <p>ATLAS no longer labels an ambiguous county extract field as annual property tax just because its column name says “Current Tax.”</p>
      </div>

      <div className="source-plan-grid researched-fact-grid">
        <article className="intel-card">
          <span className="card-kicker">{tax.taxYear ?? 'CURRENT'} TAX HISTORY</span>
          <h3>{tax.annualTaxDisplay ?? money(tax.annualTaxPreferred)}</h3>
          <p>{tax.sourceCount ?? 'Multiple'} independent public-record sources agree within a one-dollar difference.</p>
          <span className="evidence-line">Preferred display: {money(tax.annualTaxPreferred)}</span>
        </article>

        <article className="intel-card warning-card">
          <span className="card-kicker">WITHHELD COUNTY FIELD</span>
          <h3>{money(tax.countyExtractCurrentTaxField)}</h3>
          <p>{tax.countyFieldStatus ?? 'Field semantics require verification.'}</p>
          <span className="evidence-line">ATLAS will not substitute this for annual tax history.</span>
        </article>

        <article className="intel-card">
          <span className="card-kicker">TAXABLE ASSESSMENT</span>
          <h3>{money(valuation.taxableAssessedValue)}</h3>
          <p>County appraised value {money(valuation.countyAppraisedValue)}. Keep assessed value, appraised value and market estimate separate.</p>
        </article>
      </div>

      <div className="risk-list county-detail-list">
        <article className="risk-row"><div><span className="card-kicker">CAUV</span><strong>{countyRecord ? (countyRecord.hasCauv ? 'County record shows enrolled' : 'County record shows not enrolled') : 'County record required'}</strong><p>Current enrollment is not the same as “could qualify.” Eligibility and recoupment need their own analysis.</p></div><span className="finding-status verified">County record</span></article>
      </div>

      <ResearchSourcePanel profile={profile} />
    </div>
  )
}
