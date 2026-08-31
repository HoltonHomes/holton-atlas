import { motion } from 'motion/react'
import type { ResearchProfile } from '../services/researchProfile'

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

type Comparable = {
  address?: string
  salePrice?: number
  price?: number
  closeDate?: string
  saleDate?: string
  livingAreaSqFt?: number
  livingArea?: number
  acres?: number
  yearBuilt?: number
  adjustedIndication?: number
  qualityWeight?: number
  distanceMiles?: number
}

function whyItMatters(comp: Comparable, subject: { livingArea?: number | null; acres?: number | null; yearBuilt?: number | null }) {
  const reasons: string[] = []
  const area = Number(comp.livingAreaSqFt ?? comp.livingArea)
  const acres = Number(comp.acres)
  const year = Number(comp.yearBuilt)

  if (Number.isFinite(area) && subject.livingArea) {
    const diff = Math.abs(area - subject.livingArea) / subject.livingArea
    if (diff <= 0.12) reasons.push('Similar home size')
  }
  if (Number.isFinite(acres) && subject.acres) {
    const diff = Math.abs(acres - subject.acres) / Math.max(subject.acres, 0.25)
    if (diff <= 0.35) reasons.push('Similar acreage')
  }
  if (Number.isFinite(year) && subject.yearBuilt && Math.abs(year - subject.yearBuilt) <= 10) reasons.push('Similar age')
  if (Number.isFinite(comp.distanceMiles) && Number(comp.distanceMiles) <= 2) reasons.push('Close to this property')

  return reasons.length ? reasons.slice(0, 2).join(' · ') : 'Reviewed as part of the closed-sale evidence set'
}

export default function ComparableHomes({
  profile,
  livingArea,
  acres,
  yearBuilt,
}: {
  profile: ResearchProfile | null
  livingArea: number | null
  acres: number | null
  yearBuilt: number | null
}) {
  const raw = profile?.facts?.valuationEvidence?.closedComps
  const comps: Comparable[] = Array.isArray(raw) ? raw : []

  return (
    <section className="comparable-homes-workspace">
      <div className="client-workspace-heading">
        <div><span>RECENT SALES</span><h2>The homes that help explain the price.</h2></div>
        <p>Closed sales are the center of the comparison. ATLAS shows why each property matters instead of presenting a spreadsheet and asking you to decode it.</p>
      </div>

      {comps.length ? (
        <div className="comparable-home-grid">
          {comps.map((comp, index) => {
            const sale = comp.salePrice ?? comp.price
            const area = comp.livingAreaSqFt ?? comp.livingArea
            const closed = comp.closeDate ?? comp.saleDate
            return (
              <motion.article key={`${comp.address ?? 'comp'}-${index}`} className="comparable-home-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .06 }}>
                <div className="comp-photo-placeholder" aria-label="Comparable property imagery unavailable">
                  <span>RECENTLY SOLD</span>
                  <strong>{comp.address ?? 'Nearby closed sale'}</strong>
                  <small>Property imagery will appear here when an authorized media source is connected.</small>
                </div>
                <div className="comp-card-body">
                  <div className="comp-sale-line"><strong>{money(sale)}</strong><span>{closed ? `Closed ${dateLabel(closed)}` : 'Closed sale'}</span></div>
                  <div className="comp-facts">
                    {Number.isFinite(Number(area)) && <span>{Number(area).toLocaleString()} sf</span>}
                    {Number.isFinite(Number(comp.acres)) && <span>{Number(comp.acres).toFixed(2)} ac</span>}
                    {Number.isFinite(Number(comp.yearBuilt)) && <span>Built {Number(comp.yearBuilt)}</span>}
                  </div>
                  <div className="comp-why"><span>WHY THIS ONE MATTERS</span><strong>{whyItMatters(comp, { livingArea, acres, yearBuilt })}</strong></div>
                  {Number.isFinite(Number(comp.adjustedIndication)) && <small className="comp-technical">Reviewed indication {money(comp.adjustedIndication)} · methodology available in Research</small>}
                </div>
              </motion.article>
            )
          })}
        </div>
      ) : (
        <div className="no-comps-panel">
          <span>NOT ENOUGH REVIEWED SALES YET</span>
          <strong>ATLAS will not manufacture comparable homes.</strong>
          <p>When reviewed closed-sale evidence is available, this page becomes the visual explanation of the price range. Until then, the report stays explicit that the evidence is limited.</p>
        </div>
      )}
    </section>
  )
}
