import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import type { LocatedProperty, ParcelFeature } from '../services/ohioProperty'
import type { PropertyIntelligence } from '../services/propertyIntelligence'
import PropertyMap, { type PlannerName, type PlanSummary } from './PropertyMap'
import './plan-configurator.css'

type ScenarioName = 'Custom' | 'Homestead' | 'Small Farm' | 'Horse Setup'

type PlanTool = {
  name: PlannerName
  icon: string
  label: string
  note: string
}

const TOOLS: PlanTool[] = [
  { name: 'Barn', icon: '⌂', label: 'Barn', note: 'Structure + access' },
  { name: 'Garden', icon: '◫', label: 'Garden', note: 'Soil + water' },
  { name: 'Poultry', icon: '◉', label: 'Poultry', note: 'Coop + run' },
  { name: 'Pasture', icon: '▱', label: 'Pasture', note: 'Open usable ground' },
  { name: 'Goats', icon: '◇', label: 'Goats', note: 'Fence + shelter' },
  { name: 'Orchard', icon: '♢', label: 'Orchard', note: 'Sun + soil' },
  { name: 'Pond', icon: '≈', label: 'Pond', note: 'Water + wetlands' },
  { name: 'Driveway', icon: '↗', label: 'Driveway', note: 'Access + grade' },
]

const SCENARIOS: Record<ScenarioName, PlannerName[]> = {
  Custom: [],
  Homestead: ['Garden', 'Poultry', 'Orchard', 'Barn'],
  'Small Farm': ['Barn', 'Pasture', 'Garden', 'Pond'],
  'Horse Setup': ['Barn', 'Pasture', 'Driveway'],
}

function findingTone(status: string | undefined) {
  if (status === 'Problem') return 'problem'
  if (status === 'Requires Verification') return 'verify'
  return 'screened'
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
  const [scenario, setScenario] = useState<ScenarioName>('Custom')
  const [tool, setTool] = useState<PlannerName>('Barn')
  const [summary, setSummary] = useState<PlanSummary>({ count: 0, estimatedAcres: 0, byType: {} })
  const kit = SCENARIOS[scenario]

  const checks = useMemo(() => {
    const rows: Array<{ label: string; value: string; detail: string; tone: string }> = []
    const selected = tool
    if (['Garden', 'Pasture', 'Orchard', 'Goats'].includes(selected) && intelligence?.soil) {
      rows.push({ label: 'Soil', value: intelligence.soil.value, detail: intelligence.soil.detail, tone: findingTone(intelligence.soil.status) })
    }
    if (['Barn', 'Poultry', 'Pasture', 'Goats', 'Pond'].includes(selected) && intelligence?.flood) {
      rows.push({ label: 'Flood', value: intelligence.flood.value, detail: intelligence.flood.detail, tone: findingTone(intelligence.flood.status) })
    }
    if (['Barn', 'Pond', 'Pasture', 'Goats', 'Orchard'].includes(selected) && intelligence?.wetlands) {
      rows.push({ label: 'Wetlands', value: intelligence.wetlands.value, detail: intelligence.wetlands.detail, tone: findingTone(intelligence.wetlands.status) })
    }
    if (['Barn', 'Driveway', 'Pond', 'Pasture'].includes(selected) && intelligence?.terrain) {
      rows.push({ label: 'Terrain', value: intelligence.terrain.value, detail: intelligence.terrain.detail, tone: findingTone(intelligence.terrain.status) })
    }
    rows.push({ label: 'Local rules', value: zoningKnown ? 'Zoning reference available' : 'Requires verification', detail: `${selected} feasibility still depends on local use, setback and permit rules.`, tone: 'verify' })
    if (['Barn', 'Garden', 'Poultry', 'Pond', 'Driveway'].includes(selected)) {
      rows.push({ label: 'Septic / utilities', value: 'Location unknown', detail: 'Do not treat a concept placement as buildable until septic, well, utilities and easements are located.', tone: 'verify' })
    }
    return rows.slice(0, 4)
  }, [tool, intelligence, zoningKnown])

  const usagePct = acres && acres > 0 ? Math.min(100, (summary.estimatedAcres / acres) * 100) : null

  function chooseScenario(next: ScenarioName) {
    setScenario(next)
    const first = SCENARIOS[next][0]
    if (first) setTool(first)
  }

  return (
    <section className="plan-configurator">
      <header className="plan-hero">
        <div>
          <span>PROPERTY CONFIGURATOR</span>
          <h2>What are you imagining here?</h2>
          <p>Build a concept on the actual parcel. ATLAS will keep the idea separate from what is verified.</p>
        </div>
        <div className="plan-summary-chip">
          <small>Concept footprint</small>
          <strong>{summary.estimatedAcres.toFixed(2)} ac</strong>
          <span>{summary.count} placement{summary.count === 1 ? '' : 's'}</span>
        </div>
      </header>

      <div className="scenario-strip" aria-label="Planning scenarios">
        {(Object.keys(SCENARIOS) as ScenarioName[]).map((name) => (
          <button key={name} className={scenario === name ? 'active' : ''} onClick={() => chooseScenario(name)}>
            <span>{name === 'Custom' ? 'Build your own' : name}</span>
            <small>{name === 'Custom' ? 'Start from scratch' : `${SCENARIOS[name].length} suggested elements`}</small>
          </button>
        ))}
      </div>

      {scenario !== 'Custom' && (
        <motion.div className="scenario-kit" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <span>{scenario.toUpperCase()} KIT</span>
          <div>{kit.map((name) => <button key={name} className={tool === name ? 'active' : ''} onClick={() => setTool(name)}>{name}</button>)}</div>
          <small>This is a concept kit, not a recommendation that every element fits.</small>
        </motion.div>
      )}

      <div className="plan-layout">
        <aside className="plan-tool-rail">
          <div className="plan-rail-heading"><span>ADD TO THE PROPERTY</span><strong>Select, then tap the parcel.</strong></div>
          <div className="plan-tool-grid">
            {TOOLS.map((item) => (
              <button key={item.name} className={tool === item.name ? 'active' : ''} onClick={() => { setScenario('Custom'); setTool(item.name) }}>
                <i>{item.icon}</i><span><strong>{item.label}</strong><small>{item.note}</small></span>
              </button>
            ))}
          </div>
          <div className="selected-tool-card">
            <span>PLACING NOW</span>
            <strong>{tool}</strong>
            <p>Tap the aerial to add it. Drag a placed concept to move it.</p>
          </div>
        </aside>

        <div className="plan-canvas-wrap">
          <div className="plan-canvas-label"><span>CONCEPT CANVAS</span><strong>{property.address}</strong><small>Real parcel geometry when available · concepts are movable</small></div>
          <PropertyMap
            property={property}
            parcel={parcel}
            parcelVerified={parcelVerified}
            planningMode
            planningTool={tool}
            onPlanChange={setSummary}
          />
        </div>

        <aside className="plan-checks">
          <div className="plan-checks-heading"><span>ATLAS CHECKS</span><strong>{tool}</strong><p>Only the constraints relevant to this idea are shown here.</p></div>
          <div className="plan-check-list">
            {checks.map((check) => (
              <article key={check.label} className={check.tone}>
                <span>{check.label}</span>
                <strong>{check.value}</strong>
                <p>{check.detail}</p>
              </article>
            ))}
          </div>
        </aside>
      </div>

      <footer className="plan-result-bar">
        <div><span>LAND USED BY CONCEPTS</span><strong>{summary.estimatedAcres.toFixed(2)} ac{acres ? ` of ${acres.toFixed(2)} ac` : ''}</strong></div>
        <div className="plan-usage-track"><i style={{ width: `${usagePct ?? 0}%` }} /></div>
        <div><span>VERIFY BEFORE ACTING</span><strong>Survey · setbacks · septic · permits</strong></div>
      </footer>
    </section>
  )
}
