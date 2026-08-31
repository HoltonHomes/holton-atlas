import { motion } from 'motion/react'

type ClientIntent = 'buyer' | 'seller' | 'researcher'
type ClientSection = 'Property' | 'Land' | 'Reality'

type ClientDecisionGuideProps = {
  intent: ClientIntent
  parcelVerified: boolean
  landReady: boolean
  marketReady: boolean
  zoningKnown: boolean
  acres: number | null | undefined
  onOpen: (section: ClientSection) => void
}

type JourneyStep = {
  eyebrow: string
  label: string
  title: string
  detail: string
  section: ClientSection
  action: string
}

const buyerSteps: JourneyStep[] = [
  { eyebrow: 'THEN · THE LAND', label: 'The land', title: 'Understand the actual land.', detail: 'Open the parcel, terrain, soils, water and mapped constraints — then test what the property could become, right there on the map.', section: 'Land', action: 'Enter the property studio' },
  { eyebrow: 'THEN · THE REALITY CHECK', label: 'Reality check', title: 'See the price, taxes and what still needs verifying.', detail: 'Comparable sales, ownership costs, flood/wetland/soil screening and open due-diligence items in one place.', section: 'Reality', action: 'Run the reality check' },
]

const sellerSteps: JourneyStep[] = [
  { eyebrow: 'GO DEEPER · THE REALITY CHECK', label: 'Value', title: 'What might the property realistically sell for?', detail: 'The evidence-supported range, comparable sales and ownership costs, not a single automated estimate.', section: 'Reality', action: 'Understand the value' },
  { eyebrow: 'THEN · THE LAND', label: 'The land', title: 'See what a serious buyer will notice about the land.', detail: 'Access, terrain, water and mapped constraints — and what this land could be marketed for.', section: 'Land', action: 'Review the land' },
]

const researcherSteps: JourneyStep[] = [
  { eyebrow: 'THEN · THE LAND', label: 'The land', title: 'Explore the parcel.', detail: 'Terrain, soils, water, mapped constraints — and what the land could support.', section: 'Land', action: 'Explore the land' },
  { eyebrow: 'THEN · THE REALITY CHECK', label: 'Reality check', title: 'See what is known and what is not.', detail: 'Public record, mapped evidence, price context and the open questions that still need a person or local source.', section: 'Reality', action: 'Open the reality check' },
]

export default function ClientDecisionGuide({ intent, parcelVerified, landReady, marketReady, zoningKnown, acres, onOpen }: ClientDecisionGuideProps) {
  const steps = intent === 'buyer' ? buyerSteps : intent === 'seller' ? sellerSteps : researcherSteps
  const next = steps[0]
  const scan = [
    { label: 'Address', value: 'Resolved', ready: true },
    { label: 'Parcel', value: parcelVerified ? 'Matched' : 'Needs review', ready: parcelVerified },
    { label: 'Land', value: landReady ? 'Screened' : 'Loading', ready: landReady },
    { label: 'Market', value: marketReady ? 'Reviewed' : 'Limited', ready: marketReady },
  ]

  return (
    <section className="client-decision-guide focused-guide" aria-label="ATLAS guided next step">
      <div className="atlas-scan-strip compact-scan" aria-label="ATLAS property scan status">
        <div className="scan-summary">
          <span>ATLAS HAS ASSEMBLED</span>
          <strong>{acres ? `${acres.toFixed(2)} acres · property evidence in review` : 'Property evidence in review'}</strong>
          <small>{zoningKnown ? 'Zoning reference found · proposed uses still need local confirmation' : 'Local zoning still needs confirmation'}</small>
        </div>
        <div className="scan-signals">
          {scan.map((item, index) => <motion.span key={item.label} className={item.ready ? 'scan-signal ready' : 'scan-signal verify'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * .05 }}><i aria-hidden="true" />{item.label} <strong>{item.value}</strong></motion.span>)}
        </div>
      </div>

      <motion.button type="button" className="primary-question-card" onClick={() => onOpen(next.section)} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -3 }} whileTap={{ scale: .995 }}>
        <div><span>{next.eyebrow}</span><strong>{next.title}</strong><p>{next.detail}</p></div>
        <b>{next.action} →</b>
      </motion.button>

      <div className="journey-preview" aria-label="What comes next">
        {steps.slice(1).map((step, index) => <button type="button" key={`${step.eyebrow}-${step.section}`} onClick={() => onOpen(step.section)}><i>{String(index + 2).padStart(2, '0')}</i><span>{step.label}</span><small>{step.title}</small></button>)}
      </div>
    </section>
  )
}
