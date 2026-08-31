import { motion } from 'motion/react'

type ClientIntent = 'buyer' | 'seller' | 'researcher'
type ClientSection = 'Insight' | 'Home' | 'Land' | 'Reality' | 'WorkFor'

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
  { eyebrow: 'START HERE · THE HOME', label: 'The home', title: 'Know the house before the story.', detail: 'Beds, baths, square footage, year built and how the listing description compares with the public record.', section: 'Home', action: 'See the home' },
  { eyebrow: 'THEN · THE LAND', label: 'The land', title: 'Understand the actual land.', detail: 'Open the parcel, terrain, soils, water and mapped constraints before creating a story about what the property could become.', section: 'Land', action: 'Enter the property studio' },
  { eyebrow: 'THEN · THE REALITY CHECK', label: 'Reality check', title: 'See the price, taxes and what still needs verifying.', detail: 'Comparable sales, ownership costs, flood/wetland/soil screening and open due-diligence items in one place.', section: 'Reality', action: 'Run the reality check' },
  { eyebrow: 'THEN · WHAT COULD THIS WORK FOR', label: 'What it could work for', title: 'Test what you actually want to do here.', detail: 'Place a barn, garden, pasture, pond or access idea on the parcel and see the evidence behind it.', section: 'WorkFor', action: 'Test an idea' },
]

const sellerSteps: JourneyStep[] = [
  { eyebrow: 'START HERE · THE REALITY CHECK', label: 'Value', title: 'What might the property realistically sell for?', detail: 'Begin with the evidence-supported range, comparable sales and your equity position, not a single automated estimate.', section: 'Reality', action: 'Understand the value' },
  { eyebrow: 'THEN · THE HOME', label: 'The home', title: 'See the home the way a buyer will read it.', detail: 'Facts and classification, including any conflict between the listing description and the public record.', section: 'Home', action: 'Review the home' },
  { eyebrow: 'THEN · THE LAND', label: 'The land', title: 'See what a serious buyer will notice about the land.', detail: 'Access, terrain, water and mapped constraints can become either part of the story or a question to resolve.', section: 'Land', action: 'Review the land' },
  { eyebrow: 'BEFORE LISTING · WHAT IT COULD WORK FOR', label: 'Positioning', title: 'Know what this property can be marketed for.', detail: 'Garden, animals, workshop or homestead potential can become part of the story once the evidence supports it.', section: 'WorkFor', action: 'See the potential' },
]

const researcherSteps: JourneyStep[] = [
  { eyebrow: 'START HERE · THE HOME', label: 'The home', title: 'Understand the place.', detail: 'Facts a normal listing page leaves out, in one view.', section: 'Home', action: 'See the home' },
  { eyebrow: 'THEN · THE LAND', label: 'The land', title: 'Explore the parcel.', detail: 'Terrain, soils, water and mapped constraints.', section: 'Land', action: 'Explore the land' },
  { eyebrow: 'THEN · THE REALITY CHECK', label: 'Reality check', title: 'See what is known and what is not.', detail: 'Public record, mapped evidence, price context and the open questions that still need a person or local source.', section: 'Reality', action: 'Open the reality check' },
  { eyebrow: 'THEN · WHAT COULD THIS WORK FOR', label: 'What it could work for', title: 'See what the land could support.', detail: 'Garden, animals, workshop, homestead — tested against the actual evidence.', section: 'WorkFor', action: 'See the possibilities' },
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
          {scan.map((item, index) => <motion.div key={item.label} className={item.ready ? 'scan-signal ready' : 'scan-signal verify'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .05 }}><i aria-hidden="true" /><span>{item.label}</span><strong>{item.value}</strong></motion.div>)}
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
