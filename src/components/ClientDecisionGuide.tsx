import { motion } from 'motion/react'

type ClientIntent = 'buyer' | 'seller' | 'researcher'
type ClientSection = 'Brief' | 'Explore' | 'Plan' | 'Money' | 'Property' | 'Strategy' | 'Value' | 'Research'

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
  { eyebrow: 'START HERE · PROPERTY FIT', label: 'Property fit', title: 'Understand the actual land first.', detail: 'Open the parcel, terrain, soils, water and mapped constraints before creating a story about what the property could become.', section: 'Explore', action: 'Enter the property studio' },
  { eyebrow: 'THEN · POSSIBILITIES', label: 'Possibilities', title: 'Test what you want to do here.', detail: 'Place a barn, garden, pasture, pond or access idea on the parcel and see the evidence behind it.', section: 'Plan', action: 'Open the plan room' },
  { eyebrow: 'BEFORE COMMITTING · DUE DILIGENCE', label: 'Due diligence', title: 'Turn unknowns into a short check list.', detail: 'Use the planning room to identify the local rules, septic, access, drainage and field checks that could change the answer.', section: 'Plan', action: 'See what needs checked' },
  { eyebrow: 'THEN · MONEY', label: 'Money', title: 'Decide whether the full property makes sense.', detail: 'Bring price, comparable homes, taxes and ownership-cost context together after you understand the property.', section: 'Money', action: 'Review the money' },
]

const sellerSteps: JourneyStep[] = [
  { eyebrow: 'START HERE · VALUE', label: 'Value', title: 'What might the property realistically sell for?', detail: 'Begin with the evidence-supported range and your equity position, not a single automated estimate.', section: 'Value', action: 'Understand the value' },
  { eyebrow: 'THEN · PROPERTY STORY', label: 'Property story', title: 'See what a serious buyer will notice.', detail: 'Land, access, terrain, water and improvements can become either part of the story or a question to resolve.', section: 'Property', action: 'Review the property' },
  { eyebrow: 'THEN · POSITIONING', label: 'Positioning', title: 'Understand the comparison set.', detail: 'See the sold homes and property differences that support or challenge the asking-position story.', section: 'Strategy', action: 'Build the strategy' },
  { eyebrow: 'BEFORE LISTING · DECISION', label: 'Selling decision', title: 'Resolve what public data cannot see.', detail: 'Condition, updates, drainage work, easements and real-world details may change how buyers react.', section: 'Strategy', action: 'Review open questions' },
]

const researcherSteps: JourneyStep[] = [
  { eyebrow: 'START HERE · PROPERTY', label: 'Property', title: 'Understand the place.', detail: 'Explore the parcel and land evidence that a normal listing page leaves out.', section: 'Explore', action: 'Explore the property' },
  { eyebrow: 'THEN · RESEARCH', label: 'Research', title: 'See what is known and what is not.', detail: 'Separate public record, mapped evidence and questions that still need a person or local source.', section: 'Research', action: 'Open the research' },
  { eyebrow: 'THEN · MONEY', label: 'Money', title: 'Get the market context.', detail: 'See the evidence-supported range and comparable sales without an agent-only CMA screen.', section: 'Money', action: 'Understand the price' },
  { eyebrow: 'WHEN YOU WANT THE DETAILS · RESEARCH', label: 'Evidence', title: 'See what is known and what is not.', detail: 'Separate public record, map clue and questions that still need a person or local source.', section: 'Research', action: 'Open the research' },
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
