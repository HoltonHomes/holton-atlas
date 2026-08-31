import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { ResearchProfile } from '../services/researchProfile'
import type { PropertyIntelligence } from '../services/propertyIntelligence'
import type { CountyPropertyRecord } from '../services/countyRecords'
import { buildAtlasValuation } from '../services/valuationEngine'
import { atlasMotion, atlasReveal } from '../design/motion'

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function pct(value: number | null) {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

function ValuePositionChart({ sale, estimate, low, high }: { sale: number; estimate: number; low: number; high: number }) {
  const min = Math.min(sale, low) * 0.96
  const max = Math.max(sale, high) * 1.04
  const position = (value: number) => ((value - min) / Math.max(1, max - min)) * 100
  const gain = estimate - sale
  const gainPct = (gain / sale) * 100
  return (
    <motion.section className="owner-chart-card" {...atlasReveal} layout>
      <div className="chart-heading"><div><span>VALUE SINCE PURCHASE</span><strong>{gain >= 0 ? '+' : '−'}{money(Math.abs(gain))} · {gainPct >= 0 ? '+' : ''}{gainPct.toFixed(1)}%</strong></div><small>The current estimate remains close to the purchase price.</small></div>
      <div className="value-plot" role="img" aria-label={`Purchase price ${money(sale)}, estimated value ${money(estimate)}, likely range ${money(low)} to ${money(high)}`}>
        <div className="value-plot-axis" />
        <motion.div className="value-plot-range" initial={{ scaleX: 0, opacity: 0 }} animate={{ scaleX: 1, opacity: 1 }} transition={atlasMotion.spring.gentle} style={{ left: `${position(low)}%`, width: `${position(high) - position(low)}%`, transformOrigin: 'left center' }} />
        <motion.div className="value-marker sale-marker" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .12, ...atlasMotion.spring.gentle }} style={{ left: `${position(sale)}%` }}><i /><span>Bought<strong>{money(sale)}</strong></span></motion.div>
        <motion.div className="value-marker estimate-marker" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .2, ...atlasMotion.spring.gentle }} style={{ left: `${position(estimate)}%` }}><i /><span>Today<strong>{money(estimate)}</strong></span></motion.div>
      </div>
      <div className="value-range-note"><span>Likely range</span><strong>{money(low)}–{money(high)}</strong><small>Range reflects model uncertainty—not a guaranteed sale price.</small></div>
    </motion.section>
  )
}

function EquityChart({ equity, mortgage, value }: { equity: number; mortgage: number; value: number }) {
  const equityPct = Math.max(0, Math.min(100, (equity / value) * 100))
  return (
    <motion.section className="owner-chart-card equity-visual" {...atlasReveal} layout>
      <div className="chart-heading"><div><span>YOUR POSITION</span><strong>Estimated equity mix</strong></div><small>Based on the balance you entered.</small></div>
      <div className="equity-bar" aria-label={`${equityPct.toFixed(0)} percent equity`}><motion.i initial={{ width: 0 }} animate={{ width: `${equityPct}%` }} transition={atlasMotion.spring.gentle} /><motion.b initial={{ width: '100%' }} animate={{ width: `${100 - equityPct}%` }} transition={atlasMotion.spring.gentle} /></div>
      <div className="equity-legend"><span><i className="owned" />You may own <strong>{money(equity)}</strong></span><span><i className="owed" />Loan balance <strong>{money(mortgage)}</strong></span></div>
    </motion.section>
  )
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
      rows.push({ title: 'Taxes', text: `The latest corroborated public record shows about ${annualTaxDisplay} in annual property tax. Treat this as a historical/reference figure, not a future tax quote; transfers, reassessment, exemptions, levies and agricultural programs can change what is owed.`, tone: 'neutral' })
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
    <motion.div className="owner-overview" initial="initial" animate="animate">
      <motion.section className="owner-value-hero" {...atlasReveal} layout>
        <div className="owner-value-main">
          <span className="card-kicker">ATLAS ESTIMATED MARKET VALUE</span>
          <h2>{valuation ? money(valuation.estimate) : 'Estimate building…'}</h2>
          <p>{valuation ? `${money(valuation.rangeLow)}–${money(valuation.rangeHigh)} likely range · ${valuation.confidence} confidence` : 'ATLAS needs enough market evidence before showing a market-value estimate.'}</p>
          <motion.button whileHover={{ x: 3 }} whileTap={{ scale: .98 }} transition={atlasMotion.spring.responsive} onClick={onOpenValue}>See how ATLAS calculated this →</motion.button>
        </div>
        <div className="owner-value-side">
          <motion.div className="position-card" whileHover={{ y: -3 }} transition={atlasMotion.spring.responsive}>
            <span>Since last sale</span>
            <strong>{gain != null ? money(gain) : '—'}</strong>
            <small>{gainPct != null ? `${pct(gainPct)} vs. ${money(salePrice)}` : 'Needs a verified sale price'}</small>
          </motion.div>
          <motion.div className="position-card equity-card" whileHover={{ y: -3 }} transition={atlasMotion.spring.responsive}>
            <span>Estimated equity</span>
            <AnimatePresence mode="wait"><motion.strong key={estimatedEquity != null ? String(Math.round(estimatedEquity)) : 'empty'} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>{estimatedEquity != null ? money(estimatedEquity) : 'Add mortgage balance'}</motion.strong></AnimatePresence>
            <small>{ltv != null ? `${ltv.toFixed(1)}% estimated loan-to-value` : 'ATLAS will not guess your loan balance.'}</small>
            <input value={mortgageBalance} onChange={(event) => setMortgageBalance(event.target.value)} inputMode="decimal" placeholder="Mortgage balance" aria-label="Current mortgage balance" />
          </motion.div>
        </div>
      </motion.section>

      <motion.section className="owner-fact-row" {...atlasReveal} transition={{ ...atlasReveal.transition, delay: .06 }}>
        <div className="tax-reference-fact"><span>Recent public-record tax</span><strong>{annualTaxDisplay ?? '—'}</strong><small>Reference only · not a future tax quote</small></div>
        <div><span>Home</span><strong>{livingArea ? `${bedrooms ?? '—'} bd · ${baths ?? '—'} ba · ${livingArea.toLocaleString()} sf` : '—'}</strong></div>
        <div><span>Lot</span><strong>{acres ? `${acres.toFixed(2)} acres` : '—'}</strong></div>
        <div><span>Last sale</span><strong>{salePrice ? money(salePrice) : '—'}</strong></div>
      </motion.section>

      {annualTaxDisplay && <motion.aside className="atlas-context-note tax-context-note" {...atlasReveal} transition={{ ...atlasReveal.transition, delay: .09 }}><strong>About property taxes</strong><p>ATLAS is showing a corroborated public-record amount for context. It is not estimating the next bill. Taxes can change after a sale or reassessment and may be affected by exemptions, levies, CAUV/agricultural status, special assessments, payment timing, or lender escrow.</p></motion.aside>}

      <AnimatePresence initial={false}>
        {valuation && salePrice && <ValuePositionChart key="value-chart" sale={salePrice} estimate={valuation.estimate} low={valuation.rangeLow} high={valuation.rangeHigh} />}
        {valuation && hasMortgage && estimatedEquity != null && <EquityChart key="equity-chart" equity={estimatedEquity} mortgage={parsedMortgage} value={valuation.estimate} />}
      </AnimatePresence>

      <motion.section className="owner-know-section" {...atlasReveal} transition={{ ...atlasReveal.transition, delay: .12 }}>
        <div className="section-heading compact homeowner-heading">
          <div><p className="eyebrow">WHAT SHOULD I KNOW?</p><h2>The important stuff, without the record dump.</h2></div>
          <p>ATLAS moves technical records into the background and brings forward the items that can change a homeowner decision.</p>
        </div>
        <div className="owner-observation-grid">
          {observations.map((item, index) => (
            <motion.article key={item.title} className={`owner-observation ${item.tone}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: atlasMotion.duration.normal, delay: .06 * index, ease: atlasMotion.easing.enter }} whileHover={{ y: -3 }}>
              <span>{item.title}</span>
              <p>{item.text}</p>
            </motion.article>
          ))}
        </div>
      </motion.section>

      <motion.section className="owner-action-grid" {...atlasReveal} transition={{ ...atlasReveal.transition, delay: .16 }}>
        <motion.button whileHover={{ y: -4 }} whileTap={{ scale: .985 }} transition={atlasMotion.spring.responsive} onClick={onOpenValue}><span>Value & equity</span><strong>Understand what the home may be worth.</strong></motion.button>
        <motion.button whileHover={{ y: -4 }} whileTap={{ scale: .985 }} transition={atlasMotion.spring.responsive} onClick={onOpenLand}><span>Land & maps</span><strong>See the parcel, terrain, soil and water.</strong></motion.button>
        <motion.button whileHover={{ y: -4 }} whileTap={{ scale: .985 }} transition={atlasMotion.spring.responsive} onClick={onOpenRisks}><span>Risks & due diligence</span><strong>See what may need verification.</strong></motion.button>
      </motion.section>

      <motion.details className="property-records-drawer" {...atlasReveal} transition={{ ...atlasReveal.transition, delay: .2 }}>
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
      </motion.details>
    </motion.div>
  )
}
