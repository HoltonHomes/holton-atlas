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
  { eyebrow: '01 · PRICE', title: 'Does the price make sense?', detail: 'Start with the estimated market range and the evidence behind it before you get lost in property details.', section: 'Price', action: 'See the price evidence' },
  { eyebrow: '02 · HOMES', title: 'What are we comparing it to?', detail: 'See the actual closed sales that help explain the range and why each one matters.', section: 'Homes', action: 'See recent sales' },
  { eyebrow: '03 · PROPERTY', title: 'What am I actually buying?', detail: 'Move from the house to the parcel, land, terrain, water, soils and possibilities.', section: 'Property', action: 'Explore the property' },
  { eyebrow: '04 · RESEARCH', title: 'What could surprise me later?', detail: 'Turn unknowns into a prioritized list of things to verify before relying on the property for a plan or purchase.', section: 'Research', action: 'See what needs checked' },
]

const sellerSteps: JourneyStep[] = [
  { eyebrow: '01 · PRICE', title: 'What might the property realistically sell for?', detail: 'Start with a range supported by observed market evidence, not a single online estimate.', section: 'Price', action: 'See the value evidence' },
  { eyebrow: '02 · HOMES', title: 'What will buyers compare against me?', detail: 'Review nearby closed sales so the pricing conversation has visible evidence underneath it.', section: 'Homes', action: 'See comparable homes' },
  { eyebrow: '03 · PROPERTY', title: 'What parts of the property shape the story?', detail: 'See the land, access, terrain, water and site context that can become either a selling point or a buyer question.', section: 'Property', action: 'Review the property' },
  { eyebrow: '04 · RESEARCH', title: 'What should be explained before it becomes an objection?', detail: 'Surface the public-record gaps and property questions that deserve verification before listing.', section: 'Research', action: 'Review open questions' },
]

const researcherSteps: JourneyStep[] = [
  { eyebrow: '01 · PRICE', title: 'What is the value context?', detail: 'See the range and the evidence without turning the report into an agent-only CMA screen.', section: 'Price', action: 'Understand the price' },
  { eyebrow: '02 · HOMES', title: 'What sold nearby?', detail: 'See recent closed sales visually instead of decoding a spreadsheet.', section: 'Homes', action: 'See nearby sales' },
  { eyebrow: '03 · PROPERTY', title: 'What is this place?', detail: 'Explore the parcel, land and mapped evidence that make the property different from a normal listing page.', section: 'Property', action: 'Explore the property' },
  { eyebrow: '04 · RESEARCH', title: 'What can and cannot be verified online?', detail: 'Separate official records, map clues and questions that still need a person or local source.', section: 'Research', action: 'Open the research' },
]

export default function ClientDecisionGuide({ intent, parcelVerified, landReady, marketReady, zoningKnown, acres, onOpen }: ClientDecisionGuideProps) {
  const steps = intent === 'buyer' ? buyerSteps : intent === 'seller' ? sellerSteps : researcherSteps
  const title = intent === 'buyer'
    ? 'From “I like it” to “I understand it.”'
    : intent === 'seller'
      ? 'From “What is it worth?” to “What should I do next?”'
      : 'Explore the home, land and market without the rabbit hole.'
  const description = 'One evidence engine, shown in the order that matches the decision. Technical detail stays underneath until you want it.'

  const scan = [
    { label: 'Address', value: 'Resolved', ready: true },
    { label: 'Parcel', value: parcelVerified ? 'Verified' : 'Needs review', ready: parcelVerified },
    { label: 'Land evidence', value: landReady ? 'Loaded' : 'Still loading', ready: landReady },
    { label: 'Market evidence', value: marketReady ? 'Reviewed' : 'Limited', ready: marketReady },
  ]

  return (
    <section className="client-decision-guide" aria-label="ATLAS decision path">
      <div className="decision-guide-head">
        <div><span>{intent === 'buyer' ? 'BUYER HOME REPORT' : intent === 'seller' ? 'SELLER HOME REPORT' : 'PROPERTY RESEARCH REPORT'}</span><h3>{title}</h3></div>
        <p>{description}</p>
      </div>

      <div className="atlas-scan-strip" aria-label="ATLAS property scan status">
        <div className="scan-summary">
          <span>ATLAS PROPERTY SCAN</span>
          <strong>{acres ? `${acres.toFixed(2)} acres in review` : 'Property evidence in review'}</strong>
          <small>{zoningKnown ? 'Local zoning reference found · still verify the proposed use' : 'Local zoning still needs verification'}</small>
        </div>
        <div className="scan-signals">
          {scan.map((item, index) => (
            <motion.div key={item.label} className={item.ready ? 'scan-signal ready' : 'scan-signal verify'} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06, duration: 0.28 }}>
              <i aria-hidden="true" /><span>{item.label}</span><strong>{item.value}</strong>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="decision-step-grid">
        {steps.map((step, index) => (
          <motion.button type="button" key={step.eyebrow} className="decision-step" onClick={() => onOpen(step.section)} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + index * 0.06, duration: 0.32 }} whileHover={{ y: -4 }} whileTap={{ scale: 0.99 }}>
            <span>{step.eyebrow}</span><strong>{step.title}</strong><p>{step.detail}</p><b>{step.action} →</b>
          </motion.button>
        ))}
      </div>
    </section>
  )
}
