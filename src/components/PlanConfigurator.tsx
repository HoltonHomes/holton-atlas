import { useMemo, useState } from 'react'
import type { LocatedProperty, ParcelFeature } from '../services/ohioProperty'
import type { PropertyIntelligence } from '../services/propertyIntelligence'
import { evaluateLandUse } from '../engine/land/useSuitability'
import PropertyMap, { type PlannerName, type PlanSummary } from './PropertyMap'
import './plan-configurator.css'

type PlanTool = {
  name: PlannerName
  icon: string
  label: string
  question: string
}

const TOOLS: PlanTool[] = [
  { name: 'Barn', icon: '⌂', label: 'Barn', question: 'Could I realistically add a barn or outbuilding?' },
  { name: 'Garden', icon: '◫', label: 'Garden', question: 'Does this property look workable for a serious garden?' },
  { name: 'Poultry', icon: '◉', label: 'Poultry', question: 'What should I check before keeping chickens or other poultry here?' },
  { name: 'Pasture', icon: '▱', label: 'Pasture', question: 'Is there enough usable ground to think about pasture?' },
  { name: 'Goats', icon: '◇', label: 'Goats', question: 'What could make goats practical or impractical here?' },
  { name: 'Orchard', icon: '♢', label: 'Orchard', question: 'Does the land look like a plausible orchard site?' },
  { name: 'Pond', icon: '≈', label: 'Pond', question: 'What would I need to investigate before thinking about a pond?' },
  { name: 'Driveway', icon: '↗', label: 'Driveway', question: 'Could another access or driveway location be worth investigating?' },
]

function outcomeClass(outcome: string) {
  if (outcome === 'Concern') return 'problem'
  if (outcome === 'Promising') return 'promising'
  if (outcome === 'Possible with checks') return 'verify'
  return 'unknown'
}

export default function PlanConfigurator({
  property,
  parcel,
  parcelVerified,
  intelligence,
  acres,
  zoningKnown,
}: {
  property: LocatedProperty
  parcel: ParcelFeature | null
  parcelVerified: boolean
  intelligence: PropertyIntelligence | null
  acres: number | null
  zoningKnown: boolean
}) {
  const [tool, setTool] = useState<PlannerName>('Barn')
  const [summary, setSummary] = useState<PlanSummary>({ count: 0, byType: {} })

  const result = useMemo(() => evaluateLandUse({
    use: tool,
    acres,
    parcelVerified,
    zoningKnown,
    intelligence,
  }), [tool, acres, parcelVerified, zoningKnown, intelligence])

  const selectedTool = TOOLS.find((item) => item.name === tool) ?? TOOLS[0]
  const evidenceToShow = result.evidence.slice(0, 6)

  return (
    <section className="plan-configurator decision-plan">
      <header className="plan-hero decision-plan-hero">
        <div>
          <span>PROPERTY DECISION TOOL</span>
          <h2>What do you actually want to do here?</h2>
          <p>Choose a use. ATLAS will separate what the evidence supports from what still needs to be checked.</p>
        </div>
        <div className="plan-summary-chip honest-summary-chip">
          <small>Ideas placed on parcel</small>
          <strong>{summary.count}</strong>
          <span>No fake acreage assumptions</span>
        </div>
      </header>

      <div className="decision-tool-grid" aria-label="Property use questions">
        {TOOLS.map((item) => (
          <button key={item.name} className={tool === item.name ? 'active' : ''} onClick={() => setTool(item.name)}>
            <i>{item.icon}</i>
            <span><strong>{item.label}</strong><small>{item.question}</small></span>
          </button>
        ))}
      </div>

      <section className={`suitability-answer ${outcomeClass(result.outcome)}`}>
        <div className="suitability-answer-topline">
          <div>
            <span>ATLAS ANSWER · {result.confidence.toUpperCase()} CONFIDENCE</span>
            <h3>{result.headline}</h3>
            <p>{result.explanation}</p>
          </div>
          <strong className="suitability-outcome">{result.outcome}</strong>
        </div>

        <div className="suitability-columns">
          <div className="suitability-evidence">
            <div className="decision-section-heading"><span>WHY ATLAS SAYS THAT</span><strong>Evidence currently available</strong></div>
            {evidenceToShow.map((item) => (
              <article key={`${item.label}-${item.value}`} className={`evidence-row ${String(item.status).toLowerCase().replaceAll(' ', '-')}`}>
                <div><span>{item.label}</span><small>{item.status}</small></div>
                <strong>{item.value}</strong>
                <p>{item.detail}</p>
                {item.source && <small className="evidence-source">Source: {item.source}</small>}
              </article>
            ))}
          </div>

          <aside className="verify-next-panel">
            <div className="decision-section-heading"><span>VERIFY NEXT</span><strong>Questions that could change the answer</strong></div>
            <ol>
              {result.verifyNext.map((item) => <li key={item}>{item}</li>)}
            </ol>
            {result.blockers.length > 0 && (
              <div className="known-concerns">
                <span>KNOWN CONCERNS</span>
                {result.blockers.map((item) => <p key={item}>{item}</p>)}
              </div>
            )}
          </aside>
        </div>
      </section>

      <section className="placement-workspace">
        <div className="placement-intro">
          <div><span>SKETCH THE IDEA</span><h3>Where would you put the {selectedTool.label.toLowerCase()}?</h3></div>
          <p>This does not make the location suitable. It gives us a specific place to investigate next instead of talking about the property in the abstract.</p>
        </div>
        <div className="plan-canvas-wrap useful-canvas-wrap">
          <div className="plan-canvas-label"><span>VERIFIED PARCEL CANVAS</span><strong>{property.address}</strong><small>{parcelVerified ? 'Tap inside the parcel to place · drag to move' : 'Parcel boundary must be verified before placement'}</small></div>
          <PropertyMap
            property={property}
            parcel={parcel}
            parcelVerified={parcelVerified}
            planningMode
            planningTool={tool}
            onPlanChange={setSummary}
          />
        </div>
      </section>

      <footer className="plan-result-bar evidence-limitations-bar">
        <div><span>CURRENT LIMITATION</span><strong>Screening data is not yet parcel-wide for every layer</strong></div>
        <p>{result.limitations[0]} {result.limitations[1]}</p>
      </footer>
    </section>
  )
}
