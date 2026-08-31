import { motion } from 'motion/react'

type ClientIntent = 'buyer' | 'seller' | 'researcher'
type ClientSection = 'Summary' | 'Price' | 'Homes' | 'Property' | 'Research'

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
  title: string
  detail: string
  section: ClientSection
  action: string
}

const buyerSteps: JourneyStep[] = [
  { eyebrow: 'START HERE · PRICE', title: 'Does the price make sense?', detail: 'Start with the range and the closed-sale evidence before you get lost in everything else about the property.', section: 'Price', action: 'Understand the price' },
  { eyebrow: 'THEN · HOMES', title: 'See what actually sold.', detail: 'Compare the subject with the reviewed closed sales that help explain the range.', section: 'Homes', action: 'See recent sales' },
  { eyebrow: 'THEN · PROPERTY', title: 'Understand what you are actually buying.', detail: 'Move from the house to the parcel, terrain, soils, water and what the land may realistically support.', section: 'Property', action: 'Explore the property' },
  { eyebrow: 'BEFORE THE DECISION · RESEARCH', title: 'Resolve the questions the internet cannot settle.', detail: 'Turn septic, access, zoning, water and other unknowns into a prioritized verification list.', section: 'Research', action: 'See what needs checked' },
]

const sellerSteps: JourneyStep[] = [
  { eyebrow: 'START HERE · PRICE', title: 'What might the property realistically sell for?', detail: 'Start with the evidence-supported range, not a single automated estimate.', section: 'Price', action: 'Understand the range' },
  { eyebrow: 'THEN · HOMES', title: 'See what buyers will compare against you.', detail: 'Review the sold homes that support or challenge the range.', section: 'Homes', action: 'See comparable homes' },
  { eyebrow: 'THEN · PROPERTY', title: 'See the parts of the property that shape the story.', detail: 'Land, access, terrain, water and outbuildings can become either selling points or questions.', section: 'Property', action: 'Review the property' },
  { eyebrow: 'BEFORE LISTING · RESEARCH', title: 'Identify what public data cannot see.', detail: 'Condition, updates, drainage work, easements and other real-world details may change how a buyer reacts.', section: 'Research', action: 'Review open questions' },
]

const researcherSteps: JourneyStep[] = [
  { eyebrow: 'START HERE · PRICE', title: 'Get the market context.', detail: 'See the evidence-supported range without turning the experience into an agent-only CMA screen.', section: 'Price', action: 'Understand the price' },
  { eyebrow: 'THEN · HOMES', title: 'See what sold nearby.', detail: 'Use actual reviewed closed sales instead of a spreadsheet full of unexplained numbers.', section: 'Homes', action: 'See nearby sales' },
  { eyebrow: 'THEN · PROPERTY', title: 'Understand the place.', detail: 'Explore the parcel and land evidence that a normal listing page leaves out.', section: 'Property', action: 'Explore the property' },
  { eyebrow: 'WHEN YOU WANT THE DETAILS · RESEARCH', title: 'See what is known and what is not.', detail: 'Separate public record, map clue and questions that still need a person or local source.', section: 'Research', action: 'Open the research' },
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
        {steps.slice(1).map((step, index) => <button type="button" key={step.section} onClick={() => onOpen(step.section)}><i>{String(index + 2).padStart(2, '0')}</i><span>{step.section}</span><small>{step.title}</small></button>)}
      </div>
    </section>
  )
}
