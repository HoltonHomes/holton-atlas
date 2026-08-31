import { motion } from 'motion/react'
import type { AtlasValuation } from '../services/valuationEngine'
import type { ResearchProfile } from '../services/researchProfile'

type Intent = 'buyer' | 'seller' | 'researcher'

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function evidenceLabel(valuation: AtlasValuation, compCount: number) {
  if (valuation.confidence === 'High') {
    return {
      level: 'Strong evidence',
      detail: `ATLAS has a recent subject sale, ${compCount || 'multiple'} reviewed closed sales and independent valuation signals that cluster closely enough to support a relatively tight range.`,
      tone: 'strong',
    }
  }
  if (valuation.confidence === 'Moderate') {
    return {
      level: 'Good evidence',
      detail: compCount >= 3
        ? `ATLAS found ${compCount} useful reviewed closed sales, but the evidence varies enough that the range should stay wider.`
        : 'There is useful market evidence, but not enough close, consistent closed-sale support to call the range tight.',
      tone: 'good',
    }
  }
  return {
    level: 'Limited evidence',
    detail: compCount
      ? `ATLAS found ${compCount} reviewed closed ${compCount === 1 ? 'sale' : 'sales'}, but this property is unusual enough that the range should remain broad.`
      : 'There are not enough close recent closed sales in the reviewed evidence set to support a tight range.',
    tone: 'limited',
  }
}

export default function ValueStory({ valuation, profile, intent }: { valuation: AtlasValuation; profile: ResearchProfile; intent: Intent }) {
  const facts = profile.facts ?? {}
  const valuationEvidence = facts.valuationEvidence ?? {}
  const comps = Array.isArray(valuationEvidence.closedComps) ? valuationEvidence.closedComps : []
  const sale = facts.sale ?? {}
  const lastSale = Number(sale.price) || valuation.subjectSaleOriginal || null
  const strength = evidenceLabel(valuation, comps.length)

  const relevantValues = [valuation.rangeLow, valuation.rangeHigh, valuation.estimate, lastSale].filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  const observedMin = Math.min(...relevantValues)
  const observedMax = Math.max(...relevantValues)
  const span = Math.max(observedMax - observedMin, valuation.estimate * .16, 40000)
  const min = Math.floor((observedMin - span * .18) / 5000) * 5000
  const max = Math.ceil((observedMax + span * .18) / 5000) * 5000
  const position = (value: number) => clamp(((value - min) / Math.max(1, max - min)) * 100, 0, 100)
  const rangeLeft = position(valuation.rangeLow)
  const rangeWidth = Math.max(4, position(valuation.rangeHigh) - rangeLeft)
  const center = position(valuation.estimate)
  const salePosition = lastSale ? position(lastSale) : null

  const heading = intent === 'seller' ? 'Estimated market range' : intent === 'buyer' ? 'Recent-sale support' : 'Market value context'
  const summary = intent === 'seller'
    ? `The reviewed evidence currently supports a likely range of ${money(valuation.rangeLow)}–${money(valuation.rangeHigh)}, centered near ${money(valuation.estimate)}.`
    : intent === 'buyer'
      ? `Recent reviewed market evidence centers near ${money(valuation.estimate)}. ATLAS is not calling this a “good deal” or “bad deal”; it is showing what the current evidence supports.`
      : `The current reviewed evidence places the property near ${money(valuation.estimate)}, with a wider likely range of ${money(valuation.rangeLow)}–${money(valuation.rangeHigh)}.`

  return (
    <section className="value-story" aria-label={heading}>
      <div className="value-story-heading">
        <div><span>{intent === 'seller' ? 'WHAT MIGHT IT SELL FOR?' : intent === 'buyer' ? 'DOES THE PRICE MAKE SENSE?' : 'WHAT IS THE VALUE CONTEXT?'}</span><h3>{heading}</h3></div>
        <p>{summary}</p>
      </div>

      <div className="value-band-shell">
        <div className="value-band-axis" aria-hidden="true">
          <span>{money(min)}</span><span>{money((min + max) / 2)}</span><span>{money(max)}</span>
        </div>
        <div className="value-band-track">
          <motion.div className="value-band-range" initial={{ width: 0 }} animate={{ left: `${rangeLeft}%`, width: `${rangeWidth}%` }} transition={{ duration: .7, ease: [0.22, 1, 0.36, 1] }}>
            <span>{intent === 'buyer' ? 'RECENT-SALE RANGE' : 'ESTIMATED RANGE'}</span>
          </motion.div>
          <motion.div className="value-band-center" initial={{ opacity: 0, scale: .7 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: .35 }} style={{ left: `${center}%` }}>
            <i />
            <strong>{money(valuation.estimate)}</strong>
            <small>likely center</small>
          </motion.div>
          {salePosition != null && (
            <motion.div className="value-band-sale" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .48 }} style={{ left: `${salePosition}%` }}>
              <i />
              <strong>{money(lastSale)}</strong>
              <small>last recorded sale</small>
            </motion.div>
          )}
        </div>
      </div>

      <div className={`evidence-strength ${strength.tone}`}>
        <div><span>EVIDENCE QUALITY</span><strong>{strength.level}</strong></div>
        <p>{strength.detail}</p>
      </div>

      <div className="value-story-reasons">
        {valuation.evidence.map((row) => (
          <article key={row.label}>
            <span>{row.label}</span>
            <strong>{money(row.value)}</strong>
            <p>{row.detail}</p>
          </article>
        ))}
      </div>

      <details className="value-story-method">
        <summary>See the numbers behind this</summary>
        <div>
          <p>{valuation.note}</p>
          <p>ATLAS shows a range because market value is not a single observed fact. Closed-market evidence is weighted above automated estimates, and county tax appraisal is not treated as market value.</p>
        </div>
      </details>
    </section>
  )
}
