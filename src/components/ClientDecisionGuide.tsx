import { motion } from 'motion/react'

type ClientIntent = 'buyer' | 'seller'
type ClientSection = 'Brief' | 'Explore' | 'Plan' | 'Money'

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
  {
    eyebrow: '01 · PROPERTY FIT',
    title: 'Understand the site, not just the house.',
    detail: 'See the parcel, terrain, water, soils and land constraints before deciding what deserves a closer look.',
    section: 'Explore',
    action: 'Explore the property',
  },
  {
    eyebrow: '02 · POSSIBILITIES',
    title: 'Test what you want to do here.',
    detail: 'Use ATLAS planning as a screening tool for gardens, animals, barns and other rural-property ideas.',
    section: 'Plan',
    action: 'Test a property idea',
  },
  {
    eyebrow: '03 · DUE DILIGENCE',
    title: 'Turn unknowns into questions before the offer.',
    detail: 'ATLAS separates mapped evidence from items that still require the county, seller, inspector, surveyor or another professional.',
    section: 'Explore',
    action: 'Review risk signals',
  },
  {
    eyebrow: '04 · MONEY',
    title: 'Know the evidence behind the price.',
    detail: 'Review valuation evidence, recorded taxes and ownership-cost context without pretending historical records are future guarantees.',
    section: 'Money',
    action: 'Review the money',
  },
]

const sellerSteps: JourneyStep[] = [
  {
    eyebrow: '01 · VALUE',
    title: 'Start with evidence, not a single online estimate.',
    detail: 'See the subject sale, comparable evidence and outside valuation signals that shape the current ATLAS range.',
    section: 'Money',
    action: 'Review value evidence',
  },
  {
    eyebrow: '02 · PROPERTY STORY',
    title: 'Understand what a buyer will actually evaluate.',
    detail: 'Surface the land, access, terrain, water and property facts that can become selling points or questions during due diligence.',
    section: 'Explore',
    action: 'Review the property',
  },
  {
    eyebrow: '03 · POSITIONING',
    title: 'Decide what is worth improving or explaining.',
    detail: 'Use the property plan to think through practical improvements, land use and the parts of the property that deserve clearer presentation.',
    section: 'Plan',
    action: 'Build the strategy',
  },
  {
    eyebrow: '04 · DECISION',
    title: 'Separate the current record from the next-owner outcome.',
    detail: 'Taxes, exemptions, assessments and ownership costs can change. ATLAS keeps the record visible while flagging what needs verification.',
    section: 'Money',
    action: 'Review costs and taxes',
  },
]

export default function ClientDecisionGuide({
  intent,
  parcelVerified,
  landReady,
  marketReady,
  zoningKnown,
  acres,
  onOpen,
}: ClientDecisionGuideProps) {
  const steps = intent === 'buyer' ? buyerSteps : sellerSteps
  const title = intent === 'buyer'
    ? 'A guided path from “I like it” to “I understand it.”'
    : 'A guided path from “What is it worth?” to “What should I do next?”'
  const description = intent === 'buyer'
    ? 'ATLAS keeps you out of the rabbit hole by putting the next decision in front of you while the source-level evidence stays available underneath.'
    : 'ATLAS brings value, property context and buyer-facing questions into one sequence so the selling decision is easier to reason through.'

  const scan = [
    { label: 'Address', value: 'Resolved', ready: true },
    { label: 'Parcel', value: parcelVerified ? 'Verified' : 'Needs review', ready: parcelVerified },
    { label: 'Land intelligence', value: landReady ? 'Loaded' : 'Still loading', ready: landReady },
    { label: 'Market evidence', value: marketReady ? 'Reviewed' : 'Limited', ready: marketReady },
  ]

  return (
    <section className="client-decision-guide" aria-label="ATLAS decision path">
      <div className="decision-guide-head">
        <div>
          <span>{intent === 'buyer' ? 'BUYER DECISION PATH' : 'SELLER DECISION PATH'}</span>
          <h3>{title}</h3>
        </div>
        <p>{description}</p>
      </div>

      <div className="atlas-scan-strip" aria-label="ATLAS property scan status">
        <div className="scan-summary">
          <span>ATLAS PROPERTY SCAN</span>
          <strong>{acres ? `${acres.toFixed(2)} acres in review` : 'Property evidence in review'}</strong>
          <small>{zoningKnown ? 'Local zoning reference found' : 'Local zoning still requires verification'}</small>
        </div>
        <div className="scan-signals">
          {scan.map((item, index) => (
            <motion.div
              key={item.label}
              className={item.ready ? 'scan-signal ready' : 'scan-signal verify'}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06, duration: 0.28 }}
            >
              <i aria-hidden="true" />
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="decision-step-grid">
        {steps.map((step, index) => (
          <motion.button
            type="button"
            key={step.eyebrow}
            className="decision-step"
            onClick={() => onOpen(step.section)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 + index * 0.06, duration: 0.32 }}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.99 }}
          >
            <span>{step.eyebrow}</span>
            <strong>{step.title}</strong>
            <p>{step.detail}</p>
            <b>{step.action} →</b>
          </motion.button>
        ))}
      </div>
    </section>
  )
}
