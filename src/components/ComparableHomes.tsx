import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import type { ResearchProfile } from '../services/researchProfile'

type StreetViewState =
  | { status: 'no-key' | 'no-address' | 'checking' | 'no-coverage' }
  | { status: 'available'; imageUrl: string }

function useStreetViewImage(address: string | undefined): StreetViewState {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  const [state, setState] = useState<StreetViewState>(() => {
    if (!apiKey) return { status: 'no-key' }
    if (!address) return { status: 'no-address' }
    return { status: 'checking' }
  })

  useEffect(() => {
    if (!apiKey) {
      setState({ status: 'no-key' })
      return
    }
    if (!address) {
      setState({ status: 'no-address' })
      return
    }
    let cancelled = false
    setState({ status: 'checking' })
    const location = encodeURIComponent(address)
    // Street View returns a generic gray "no imagery" placeholder even when
    // nothing real exists at the location, so check the free metadata
    // endpoint first rather than trusting the image request to fail.
    fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?size=400x300&location=${location}&key=${apiKey}`)
      .then((response) => response.json())
      .then((data: { status?: string }) => {
        if (cancelled) return
        if (data?.status === 'OK') {
          setState({ status: 'available', imageUrl: `https://maps.googleapis.com/maps/api/streetview?size=400x300&location=${location}&key=${apiKey}` })
        } else {
          setState({ status: 'no-coverage' })
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'no-coverage' })
      })
    return () => { cancelled = true }
  }, [address, apiKey])

  return state
}

function CompPhoto({ address, tag, fallbackTitle, className = '' }: { address: string | undefined; tag: string; fallbackTitle: string; className?: string }) {
  const streetView = useStreetViewImage(address)

  if (streetView.status === 'available') {
    return (
      <div className={`comp-photo ${className}`.trim()}>
        <img src={streetView.imageUrl} alt={`Street view of ${address}`} loading="lazy" />
        <span className="comp-photo-tag">{tag}</span>
      </div>
    )
  }

  const note = streetView.status === 'no-coverage'
    ? 'No street-level imagery is available for this address.'
    : 'Authorized property imagery will replace this panel when a licensed media source is connected.'

  return (
    <div className={`comp-photo-placeholder ${className}`.trim()} aria-label="Comparable property imagery unavailable">
      <span>{tag}</span>
      <strong>{fallbackTitle}</strong>
      <small>{note}</small>
    </div>
  )
}

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

type Subject = { livingArea: number | null; acres: number | null; yearBuilt: number | null }

function compArea(comp: Comparable) {
  const value = Number(comp.livingAreaSqFt ?? comp.livingArea)
  return Number.isFinite(value) ? value : null
}

function compAcres(comp: Comparable) {
  const value = Number(comp.acres)
  return Number.isFinite(value) ? value : null
}

function compYear(comp: Comparable) {
  const value = Number(comp.yearBuilt)
  return Number.isFinite(value) ? value : null
}

function differenceLabel(subject: number | null, comp: number | null, unit: string) {
  if (subject == null || comp == null) return null
  const diff = comp - subject
  if (Math.abs(diff) < .01) return `Same ${unit}`
  const sign = diff > 0 ? '+' : '−'
  const absolute = Math.abs(diff)
  const formatted = unit === 'sq ft' ? Math.round(absolute).toLocaleString() : unit === 'years' ? Math.round(absolute).toLocaleString() : absolute.toFixed(2)
  return `${sign}${formatted} ${unit}`
}

function whyItMatters(comp: Comparable, subject: Subject) {
  const reasons: string[] = []
  const area = compArea(comp)
  const acres = compAcres(comp)
  const year = compYear(comp)

  if (area != null && subject.livingArea) {
    const diff = Math.abs(area - subject.livingArea) / subject.livingArea
    if (diff <= .12) reasons.push('Very similar home size')
    else if (diff <= .22) reasons.push('Useful size match')
  }
  if (acres != null && subject.acres) {
    const diff = Math.abs(acres - subject.acres) / Math.max(subject.acres, .25)
    if (diff <= .25) reasons.push('Very similar acreage')
    else if (diff <= .5) reasons.push('Useful acreage match')
  }
  if (year != null && subject.yearBuilt && Math.abs(year - subject.yearBuilt) <= 10) reasons.push('Similar age')
  if (Number.isFinite(comp.distanceMiles) && Number(comp.distanceMiles) <= 2) reasons.push('Close to this property')

  return reasons.length ? reasons.slice(0, 2).join(' · ') : 'Useful closed-sale evidence, but not a near-twin'
}

function similarityScore(comp: Comparable, subject: Subject) {
  let score = Number(comp.qualityWeight ?? 0) * 40
  const area = compArea(comp)
  const acres = compAcres(comp)
  const year = compYear(comp)
  if (area != null && subject.livingArea) score += Math.max(0, 25 - Math.abs(area - subject.livingArea) / subject.livingArea * 50)
  if (acres != null && subject.acres) score += Math.max(0, 25 - Math.abs(acres - subject.acres) / Math.max(subject.acres, .25) * 35)
  if (year != null && subject.yearBuilt) score += Math.max(0, 10 - Math.abs(year - subject.yearBuilt) / 3)
  return score
}

export default function ComparableHomes({ profile, livingArea, acres, yearBuilt, subjectAddress }: { profile: ResearchProfile | null; livingArea: number | null; acres: number | null; yearBuilt: number | null; subjectAddress?: string }) {
  const raw = profile?.facts?.valuationEvidence?.closedComps
  const subject: Subject = { livingArea, acres, yearBuilt }
  const comps: Comparable[] = useMemo(() => {
    const rows: Comparable[] = Array.isArray(raw) ? raw : []
    return [...rows].sort((a, b) => similarityScore(b, subject) - similarityScore(a, subject))
  }, [raw, livingArea, acres, yearBuilt])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const selected = comps[selectedIndex] ?? null

  return (
    <section className="comparable-homes-workspace">
      <div className="client-workspace-heading">
        <div><span>RECENT SALES</span><h2>The homes that help explain the price.</h2></div>
        <p>Closed sales are the center of the comparison. ATLAS ranks the reviewed evidence by how useful it is to this specific property, then explains the differences in plain English.</p>
      </div>

      {comps.length ? (
        <>
          <div className="comp-context-strip">
            <div><span>SUBJECT PROPERTY</span><strong>{livingArea ? `${livingArea.toLocaleString()} sq ft` : 'Size not verified'}</strong><small>{acres ? `${acres.toFixed(2)} acres` : 'Acreage not verified'}{yearBuilt ? ` · Built ${yearBuilt}` : ''}</small></div>
            <p>Tap a sold home to compare it directly with the subject. ATLAS does not call a home a “comp” just because it is nearby.</p>
          </div>

          <div className="comparable-home-grid">
            {comps.map((comp, index) => {
              const sale = comp.salePrice ?? comp.price
              const area = compArea(comp)
              const compLot = compAcres(comp)
              const closed = comp.closeDate ?? comp.saleDate
              return (
                <motion.button type="button" key={`${comp.address ?? 'comp'}-${index}`} className={selectedIndex === index ? 'comparable-home-card selected' : 'comparable-home-card'} onClick={() => setSelectedIndex(index)} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .06 }}>
                  <CompPhoto address={comp.address} tag={index === 0 ? 'CLOSEST REVIEWED MATCH' : 'REVIEWED CLOSED SALE'} fallbackTitle={comp.address ?? 'Nearby closed sale'} />
                  <div className="comp-card-body">
                    <div className="comp-sale-line"><strong>{money(sale)}</strong><span>{closed ? `Closed ${dateLabel(closed)}` : 'Closed sale'}</span></div>
                    <div className="comp-facts">
                      {area != null && <span>{area.toLocaleString()} sf</span>}
                      {compLot != null && <span>{compLot.toFixed(2)} ac</span>}
                      {compYear(comp) != null && <span>Built {compYear(comp)}</span>}
                    </div>
                    <div className="comp-why"><span>WHY THIS ONE MATTERS</span><strong>{whyItMatters(comp, subject)}</strong></div>
                    <small className="comp-open">Compare with subject →</small>
                  </div>
                </motion.button>
              )
            })}
          </div>

          {selected && (
            <motion.section key={`${selected.address}-${selectedIndex}`} className="subject-comp-compare" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <div className="compare-heading"><div><span>HOW THIS HOME COMPARES</span><strong>Subject property ↔ {selected.address ?? 'selected closed sale'}</strong></div><p>This is comparison evidence, not an automatic dollar adjustment. Differences become reasons to widen, tighten or investigate the range.</p></div>
              <div className="compare-property-grid">
                <article><CompPhoto address={subjectAddress} tag="SUBJECT" fallbackTitle="This property" className="compare-photo" /><span>SUBJECT</span><strong>This property</strong><div>{livingArea && <b>{livingArea.toLocaleString()} sq ft</b>}{acres && <b>{acres.toFixed(2)} acres</b>}{yearBuilt && <b>Built {yearBuilt}</b>}</div></article>
                <article><CompPhoto address={selected.address} tag="CLOSED SALE" fallbackTitle={selected.address ?? 'Reviewed sale'} className="compare-photo" /><span>CLOSED SALE</span><strong>{selected.address ?? 'Reviewed sale'}</strong><div>{compArea(selected) != null && <b>{compArea(selected)?.toLocaleString()} sq ft</b>}{compAcres(selected) != null && <b>{compAcres(selected)?.toFixed(2)} acres</b>}{compYear(selected) != null && <b>Built {compYear(selected)}</b>}</div></article>
              </div>
              <div className="compare-difference-chips">
                {differenceLabel(livingArea, compArea(selected), 'sq ft') && <span>{differenceLabel(livingArea, compArea(selected), 'sq ft')}</span>}
                {differenceLabel(acres, compAcres(selected), 'acres') && <span>{differenceLabel(acres, compAcres(selected), 'acres')}</span>}
                {differenceLabel(yearBuilt, compYear(selected), 'years') && <span>{differenceLabel(yearBuilt, compYear(selected), 'years')}</span>}
                {Number.isFinite(Number(selected.distanceMiles)) && <span>{Number(selected.distanceMiles).toFixed(1)} mi away</span>}
              </div>
              <div className="compare-bottom"><div><span>SOLD FOR</span><strong>{money(selected.salePrice ?? selected.price)}</strong></div>{Number.isFinite(Number(selected.adjustedIndication)) && <div><span>REVIEWED INDICATION</span><strong>{money(selected.adjustedIndication)}</strong></div>}<p>{whyItMatters(selected, subject)}. Any final adjustment remains reviewable rather than being silently manufactured by the interface.</p></div>
            </motion.section>
          )}
        </>
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
