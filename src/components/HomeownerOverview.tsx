import { useMemo, useState } from 'react'
import type { ResearchProfile } from '../services/researchProfile'
import type { PropertyIntelligence } from '../services/propertyIntelligence'
import type { CountyPropertyRecord } from '../services/countyRecords'
import { buildAtlasValuation } from '../services/valuationEngine'

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function pct(value: number | null) {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

export default function HomeownerOverview({
  researchProfile,
  intelligence,
  countyRecord,
  acres,
  livingArea,
  bedrooms,
  baths,
  salePrice,
  annualTaxDisplay,
  parcelId,
  zoning,
  classificationMls,
  classificationPublic,
  onOpenValue,
  onOpenLand,
  onOpenRisks,
}: {
  researchProfile: ResearchProfile | null
  intelligence: PropertyIntelligence | null
  countyRecord: CountyPropertyRecord | null
  acres: number | null
  livingArea: number | null
  bedrooms: number | null | undefined
  baths: number | null | undefined
  salePrice: number | null
  annualTaxDisplay: string | null
  parcelId: unknown
  zoning: string | null
  classificationMls: string | null
  classificationPublic: string | null
  onOpenValue: () => void
  onOpenLand: () => void
  onOpenRisks: () => void
}) {
  const valuation = useMemo(() => buildAtlasValuation(researchProfile), [researchProfile])
  const [mortgageBalance, setMortgageBalance] = useState('')
  const parsedMortgage = Number(mortgageBalance.replace(/[$,]/g, ''))
  const hasMortgage = Number.isFinite(parsedMortgage) && parsedMortgage >= 0 && mortgageBalance.trim() !== ''
  const estimatedEquity = valuation && hasMortgage ? valuation.estimate - parsedMortgage : null
  const ltv = valuation && hasMortgage && valuation.estimate > 0 ? (parsedMortgage / valuation.estimate) * 100 : null
  const gain = valuation && salePrice ? valuation.estimate - salePrice : null
  const gainPct = valuation && salePrice ? ((valuation.estimate - salePrice) / salePrice) * 100 : null

  const observations = useMemo(() => {
    const rows: Array<{ title: string; text: string; tone: 'neutral' | 'good' | 'attention' }> = []
    if (valuation && salePrice) {
      const direction = valuation.estimate >= salePrice ? 'above' : 'below'
      rows.push({
        title: 'Value',
        text: `ATLAS currently estimates the property at ${money(valuation.estimate)}, ${money(Math.abs(valuation.estimate - salePrice))} ${direction} the last recorded purchase price.`,
        tone: 'neutral',
      })
    }
    if (annualTaxDisplay) {
      rows.push({ title: 'Taxes', text: `Public sources currently support annual property taxes around ${annualTaxDisplay}.`, tone: 'neutral' })
    }
    if (intelligence?.flood) {
      rows.push({
        title: 'Flood',
        text: intelligence.flood.status === 'Problem' ? intelligence.flood.detail : `${intelligence.flood.value}. ${intelligence.flood.detail}`,
        tone: intelligence.flood.status === 'Problem' ? 'attention' : 'good',
      })
    }
    if (intelligence?.wetlands) {
      rows.push({
        title: 'Wetlands',
        text: `${intelligence.wetlands.value}. ${intelligence.wetlands.detail}`,
        tone: intelligence.wetlands.status === 'Problem' ? 'attention' : 'neutral',
      })
    }
    if (acres) {
      rows.push({ title: 'Land', text: `${acres.toFixed(2)} acres are associated with the property record. Open Land & Maps to inspect terrain, soil, water, flood and wetlands together.`, tone: 'neutral' })
    }
    return rows.slice(0, 4)
  }, [valuation, salePrice, annualTaxDisplay, intelligence, acres])

  return (
    <div className="owner-overview">
      <section className="owner-value-hero">
        <div className="owner-value-main">
          <span className="card-kicker">ATLAS ESTIMATED MARKET VALUE</span>
          <h2>{valuation ? money(valuation.estimate) : 'Estimate building…'}</h2>
          <p>{valuation ? `${money(valuation.rangeLow)}–${money(valuation.rangeHigh)} likely range · ${valuation.confidence} confidence` : 'ATLAS needs enough market evidence before showing a market-value estimate.'}</p>
          <button onClick={onOpenValue}>See how ATLAS calculated this →</button>
        </div>
        <div className="owner-value-side">
          <div className="position-card">
            <span>Since last sale</span>
            <strong>{gain != null ? money(gain) : '—'}</strong>
            <small>{gainPct != null ? `${pct(gainPct)} vs. ${money(salePrice)}` : 'Needs a verified sale price'}</small>
          </div>
          <div className="position-card equity-card">
            <span>Estimated equity</span>
            <strong>{estimatedEquity != null ? money(estimatedEquity) : 'Add mortgage balance'}</strong>
            <small>{ltv != null ? `${ltv.toFixed(1)}% estimated loan-to-value` : 'ATLAS will not guess your loan balance.'}</small>
            <input value={mortgageBalance} onChange={(event) => setMortgageBalance(event.target.value)} inputMode="decimal" placeholder="Mortgage balance" aria-label="Current mortgage balance" />
          </div>
        </div>
      </section>

      <section className="owner-fact-row">
        <div><span>Annual taxes</span><strong>{annualTaxDisplay ?? '—'}</strong></div>
        <div><span>Home</span><strong>{livingArea ? `${bedrooms ?? '—'} bd · ${baths ?? '—'} ba · ${livingArea.toLocaleString()} sf` : '—'}</strong></div>
        <div><span>Lot</span><strong>{acres ? `${acres.toFixed(2)} acres` : '—'}</strong></div>
        <div><span>Last sale</span><strong>{salePrice ? money(salePrice) : '—'}</strong></div>
      </section>

      <section className="owner-know-section">
        <div className="section-heading compact homeowner-heading">
          <div><p className="eyebrow">WHAT SHOULD I KNOW?</p><h2>The important stuff, without the record dump.</h2></div>
          <p>ATLAS moves technical records into the background and brings forward the items that can change a homeowner decision.</p>
        </div>
        <div className="owner-observation-grid">
          {observations.map((item) => (
            <article key={item.title} className={`owner-observation ${item.tone}`}>
              <span>{item.title}</span>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="owner-action-grid">
        <button onClick={onOpenValue}><span>Value & equity</span><strong>Understand what the home may be worth.</strong></button>
        <button onClick={onOpenLand}><span>Land & maps</span><strong>See the parcel, terrain, soil and water.</strong></button>
        <button onClick={onOpenRisks}><span>Risks & due diligence</span><strong>See what may need verification.</strong></button>
      </section>

      <details className="property-records-drawer">
        <summary><span>Property records & sources</span><small>Parcel, zoning, classifications and county fields</small></summary>
        <div className="records-grid">
          <div><span>Parcel ID</span><strong>{String(parcelId ?? 'Requires verification')}</strong></div>
          <div><span>Zoning</span><strong>{zoning ?? 'Requires local verification'}</strong></div>
          <div><span>County appraisal</span><strong>{countyRecord?.appraisedTotal ? money(countyRecord.appraisedTotal) : '—'}</strong></div>
          <div><span>Taxable assessment</span><strong>{countyRecord?.assessedTotal ? money(countyRecord.assessedTotal) : '—'}</strong></div>
          {classificationMls && <div><span>Consumer-facing classification</span><strong>{classificationMls}</strong></div>}
          {classificationPublic && <div><span>Public-record classification</span><strong>{classificationPublic}</strong></div>}
        </div>
        {classificationMls && classificationPublic && <p className="records-note">ATLAS keeps conflicting classifications separate because a tax/land-use code is not automatically the same thing as the physical home type.</p>}
      </details>
    </div>
  )
}
