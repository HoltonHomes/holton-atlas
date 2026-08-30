import type { IntelligenceFinding, PropertyIntelligence } from '../services/propertyIntelligence'

const uses = [
  ['🐓', 'Poultry'],
  ['🐐', 'Goats'],
  ['🐎', 'Horses'],
  ['🐄', 'Cattle'],
  ['🥕', 'Market garden'],
  ['🌳', 'Orchard'],
  ['🏡', 'Homestead'],
  ['🚜', 'Hobby farm'],
] as const

function StatusBadge({ status }: { status: IntelligenceFinding['status'] }) {
  return <span className={`finding-status ${status.toLowerCase().replaceAll(' ', '-')}`}>{status}</span>
}

export function IntelligenceStrip({ intelligence, loading }: { intelligence: PropertyIntelligence | null; loading: boolean }) {
  if (loading) {
    return <div className="intel-strip loading"><div /><div /><div /><div /></div>
  }
  if (!intelligence) return null
  return (
    <div className="intel-strip">
      {[intelligence.soil, intelligence.flood, intelligence.wetlands, intelligence.terrain].map((finding) => (
        <article key={finding.key} className="intel-mini-card">
          <div className="intel-mini-top"><span>{finding.label}</span><StatusBadge status={finding.status} /></div>
          <strong>{finding.value}</strong>
          <small>{finding.source}</small>
        </article>
      ))}
    </div>
  )
}

export function LandMapsSection({
  intelligence,
  loading,
  activeLayers,
  onToggleLayer,
}: {
  intelligence: PropertyIntelligence | null
  loading: boolean
  activeLayers: string[]
  onToggleLayer: (layer: string) => void
}) {
  return (
    <div className="data-section">
      <div className="section-heading">
        <div><p className="eyebrow">LAND & MAPS</p><h2>Read the land as a system.</h2></div>
        <p>Use one aerial and turn on the evidence you need. These layers are screening tools; parcel-level conclusions stay separate from point-level findings.</p>
      </div>
      <div className="layer-toolbar" aria-label="Map layers">
        {['Terrain', 'Slope', 'Soils', 'Flood', 'Wetlands'].map((layer) => (
          <button key={layer} className={activeLayers.includes(layer) ? 'active' : ''} onClick={() => onToggleLayer(layer)}>
            <span className="layer-check">{activeLayers.includes(layer) ? '✓' : '+'}</span>{layer}
          </button>
        ))}
      </div>
      <IntelligenceStrip intelligence={intelligence} loading={loading} />
      <div className="interpretation-card">
        <span className="card-kicker">HOW TO READ THIS</span>
        <h3>The map is evidence, not a permit.</h3>
        <p>ATLAS shows official public layers and clearly labels what is verified at the searched point versus what still needs a full-parcel intersection, field inspection, survey, health-department record, or zoning confirmation.</p>
      </div>
    </div>
  )
}

function potentialFor(label: string, intelligence: PropertyIntelligence | null, acres: number | null, zoningKnown: boolean) {
  if (!intelligence) return { status: 'Requires Verification' as const, note: 'Waiting for land intelligence.' }
  const wet = intelligence.wetlands.status === 'Requires Verification' && !intelligence.wetlands.value.toLowerCase().includes('no nwi')
  const flood = intelligence.flood.status === 'Problem'
  const soilText = `${intelligence.soil.value} ${intelligence.soil.detail}`.toLowerCase()
  const primeSoil = soilText.includes('prime farmland') || soilText.includes('statewide importance') || soilText.includes('capability class: 1') || soilText.includes('capability class: 2')

  if (label === 'Market garden' || label === 'Orchard') {
    if (flood || wet) return { status: 'Requires Verification' as const, note: 'Mapped water constraints need parcel-level review before siting.' }
    if (primeSoil) return { status: 'Likely' as const, note: 'Soil signal is encouraging; slope, drainage and sun still matter.' }
    return { status: 'Requires Verification' as const, note: 'Soil is mapped; drainage, slope and usable-area analysis comes next.' }
  }

  if (['Horses', 'Cattle', 'Goats'].includes(label)) {
    if (!acres || !zoningKnown) return { status: 'Requires Verification' as const, note: 'Needs verified acreage, zoning and usable pasture area.' }
    return { status: 'Likely' as const, note: 'Acreage is known; stocking and zoning rules still need local verification.' }
  }

  if (label === 'Poultry') {
    if (!zoningKnown) return { status: 'Requires Verification' as const, note: 'Local animal and setback rules still need verification.' }
    return { status: 'Likely' as const, note: 'Zoning is known; setbacks and flock limits should still be checked.' }
  }

  return { status: 'Requires Verification' as const, note: 'Requires zoning, septic, access and buildable-area checks.' }
}

export function RuralPotentialSection({
  intelligence,
  acres,
  zoningKnown,
}: {
  intelligence: PropertyIntelligence | null
  acres: number | null
  zoningKnown: boolean
}) {
  return (
    <div className="data-section">
      <div className="section-heading">
        <div><p className="eyebrow">RURAL POTENTIAL</p><h2>What could actually work here?</h2></div>
        <p>ATLAS does not answer “allowed” from a pretty map. It combines land signals with the records still needed before making a confident call.</p>
      </div>
      <div className="potential-grid">
        {uses.map(([icon, label]) => {
          const result = potentialFor(label, intelligence, acres, zoningKnown)
          return (
            <article className="potential-card" key={label}>
              <div className="potential-icon">{icon}</div>
              <div className="potential-copy"><strong>{label}</strong><p>{result.note}</p></div>
              <StatusBadge status={result.status} />
            </article>
          )
        })}
      </div>
      <div className="next-analysis">
        <span className="card-kicker">NEXT DERIVED LAYERS</span>
        <h3>Usable pasture · garden zones · barn/building areas</h3>
        <p>Those should be calculated from the verified parcel polygon after subtracting mapped water constraints, steep slopes, existing improvements and known setbacks—not guessed from acreage alone.</p>
      </div>
    </div>
  )
}

export function RisksSection({ intelligence, county, parcelVerified }: { intelligence: PropertyIntelligence | null; county: string | null; parcelVerified: boolean }) {
  const rows: Array<{ title: string; status: IntelligenceFinding['status']; value: string; detail: string }> = []

  if (intelligence) {
    rows.push({ title: 'Flood exposure', status: intelligence.flood.status, value: intelligence.flood.value, detail: intelligence.flood.detail })
    rows.push({ title: 'Mapped wetlands', status: intelligence.wetlands.status, value: intelligence.wetlands.value, detail: intelligence.wetlands.detail })
  }

  rows.push({ title: 'Septic / onsite wastewater', status: 'Requires Verification', value: 'Local health record needed', detail: 'ATLAS should pull public septic records where the local health district exposes them; absence of a record is not proof of no system.' })
  rows.push({ title: 'Zoning & livestock', status: 'Requires Verification', value: `${county ?? 'Local'} jurisdiction check needed`, detail: 'Township/county zoning is fragmented in Ohio. ATLAS will keep the controlling jurisdiction and last-reviewed source attached to the answer.' })
  rows.push({ title: 'Parcel-wide constraints', status: parcelVerified ? 'Likely' : 'Requires Verification', value: parcelVerified ? 'Parcel geometry available' : 'Verified parcel boundary still needed', detail: 'Buildable area, pasture, garden and barn siting should use the legal parcel polygon rather than the address point.' })

  return (
    <div className="data-section">
      <div className="section-heading"><div><p className="eyebrow">RISKS & DUE DILIGENCE</p><h2>What could become expensive or limiting?</h2></div><p>ATLAS surfaces the questions that deserve money, records or a professional before a buyer commits.</p></div>
      <div className="risk-list">
        {rows.map((row) => (
          <article key={row.title} className="risk-row">
            <div><span className="card-kicker">{row.title}</span><strong>{row.value}</strong><p>{row.detail}</p></div>
            <StatusBadge status={row.status} />
          </article>
        ))}
      </div>
    </div>
  )
}

export function HomeValueSection({ parcelVerified, county }: { parcelVerified: boolean; county: string | null }) {
  return (
    <div className="data-section">
      <div className="section-heading"><div><p className="eyebrow">HOME & VALUE</p><h2>The home, the record and the market around it.</h2></div><p>This section should never invent a CMA from a geocoder. County facts and transfer history come first; MLS-quality comps strengthen the valuation later.</p></div>
      <div className="source-plan-grid">
        <article className="intel-card"><span className="card-kicker">PROPERTY RECORD</span><h3>{parcelVerified ? 'County parcel connected' : `${county ?? 'County'} adapter needed`}</h3><p>Parcel ID, acreage, building facts, assessed/appraised values and transfers belong to the official county/auditor record.</p></article>
        <article className="intel-card"><span className="card-kicker">CMA</span><h3>Rural-weighted comparables</h3><p>ATLAS will weight acreage, living area, age, location, outbuildings, land characteristics and recency instead of pretending suburban comp logic fits acreage homes.</p></article>
        <article className="intel-card"><span className="card-kicker">EVIDENCE</span><h3>Conflicts stay visible</h3><p>If auditor acreage, GIS acreage or another source disagree, ATLAS should show the conflict and source dates rather than silently choosing one.</p></article>
      </div>
    </div>
  )
}

export function CostsSection({ county }: { county: string | null }) {
  return (
    <div className="data-section">
      <div className="section-heading"><div><p className="eyebrow">COSTS</p><h2>What will this property cost to carry?</h2></div><p>Purchase price is only one number. Rural decisions need taxes, CAUV, financing and recurring property costs in the same view.</p></div>
      <div className="source-plan-grid">
        <article className="intel-card"><span className="card-kicker">TAXES</span><h3>{county ? `${county} County tax record` : 'County tax record'}</h3><p>Current taxes, assessed values and transfer history should come from the county record when connected.</p></article>
        <article className="intel-card"><span className="card-kicker">CAUV</span><h3>Enrollment + consequence</h3><p>ATLAS should distinguish current CAUV enrollment from “could qualify,” show the tax effect, and flag recoupment/qualification questions.</p></article>
        <article className="intel-card"><span className="card-kicker">CARRYING COSTS</span><h3>Beyond the mortgage</h3><p>Utilities, insurance, septic/well maintenance, fencing, driveway, outbuildings and land upkeep belong in the ownership picture.</p></article>
      </div>
    </div>
  )
}
