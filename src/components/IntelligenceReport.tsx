import type { IntelligenceFinding, PropertyIntelligence } from '../services/propertyIntelligence'
import type { CountyPropertyRecord } from '../services/countyRecords'

function money(value: unknown) {
  const number = Number(value)
  if (!Number.isFinite(number) || number === 0) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(number)
}

function dateLabel(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.split(' ')[0]
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function StatusBadge({ status }: { status: IntelligenceFinding['status'] }) {
  return <span className={`finding-status ${status.toLowerCase().replaceAll(' ', '-')}`}>{status}</span>
}

export function IntelligenceStrip({ intelligence, loading }: { intelligence: PropertyIntelligence | null; loading: boolean }) {
  if (loading) return <div className="intel-strip loading"><div /><div /><div /><div /></div>
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

export function LandMapsSection({ intelligence, loading, activeLayers, onToggleLayer }: {
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
        {['Terrain', 'Topography', 'Slope', 'Soils', 'Water', 'Flood', 'Wetlands'].map((layer) => (
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

function propertyIdeas(intelligence: PropertyIntelligence | null, acres: number | null, zoningKnown: boolean) {
  if (!intelligence) return []
  const wet = intelligence.wetlands.status === 'Requires Verification' && !intelligence.wetlands.value.toLowerCase().includes('no nwi')
  const flood = intelligence.flood.status === 'Problem'
  const soilText = `${intelligence.soil.value} ${intelligence.soil.detail}`.toLowerCase()
  const primeSoil = soilText.includes('prime farmland') || soilText.includes('statewide importance') || soilText.includes('capability class: 1') || soilText.includes('capability class: 2')
  return [
    {
      icon: '🥕', title: 'Garden or orchard', status: primeSoil && !flood && !wet ? 'Screened' as const : 'Requires Verification' as const,
      verdict: primeSoil && !flood && !wet ? 'Worth exploring' : 'Site conditions still needed',
      evidence: primeSoil ? 'Mapped soil is an encouraging first signal.' : 'A soil unit is mapped, but productivity is not yet established.',
      checks: 'Confirm sun, drainage, slope and a usable location across the parcel.',
    },
    {
      icon: '🐓', title: 'Small livestock', status: 'Requires Verification' as const,
      verdict: acres ? 'Space may be available' : 'Acreage not verified',
      evidence: acres ? `${acres.toFixed(2)} recorded acres gives this idea room to investigate.` : 'ATLAS does not have dependable acreage yet.',
      checks: `${zoningKnown ? 'A zoning label is present, but' : 'Zoning,'} animal limits, setbacks, shelter and neighbor impacts still need local confirmation.`,
    },
    {
      icon: '🐎', title: 'Pasture or large animals', status: 'Requires Verification' as const,
      verdict: acres && acres >= 3 ? 'Acreage warrants review' : 'Not supported by acreage alone',
      evidence: acres ? `${acres.toFixed(2)} total acres is not the same as usable pasture acreage.` : 'Total acreage is not verified.',
      checks: 'Calculate open/usable acres, forage quality, water, fencing, shelter and stocking needs before calling this feasible.',
    },
    {
      icon: '🏡', title: 'Barn, workshop or addition', status: 'Requires Verification' as const,
      verdict: 'No buildable area calculated',
      evidence: flood || wet ? 'Mapped water constraints need attention.' : 'The address point has no mapped water red flag, but that does not clear a building site.',
      checks: 'Needs parcel-wide constraints, septic reserve area, access, utilities, setbacks and permits.',
    },
  ]
}

export function RuralPotentialSection({ intelligence, acres, zoningKnown }: {
  intelligence: PropertyIntelligence | null
  acres: number | null
  zoningKnown: boolean
}) {
  const ideas = propertyIdeas(intelligence, acres, zoningKnown)
  return (
    <div className="data-section">
      <div className="section-heading">
        <div><p className="eyebrow">PROPERTY IDEAS</p><h2>What is worth exploring?</h2></div>
        <p>These are screening paths—not approvals. ATLAS separates the evidence that supports an idea from the checks that could still stop it.</p>
      </div>
      <div className="idea-grid">
        {ideas.map((idea) => <article className="idea-card" key={idea.title}>
          <div className="idea-card-top"><span className="potential-icon">{idea.icon}</span><StatusBadge status={idea.status} /></div>
          <h3>{idea.title}</h3><strong>{idea.verdict}</strong>
          <dl><div><dt>Why it is here</dt><dd>{idea.evidence}</dd></div><div><dt>Before acting</dt><dd>{idea.checks}</dd></div></dl>
        </article>)}
      </div>
      <div className="next-analysis">
        <span className="card-kicker">WHAT WOULD MAKE THIS DECISIVE</span>
        <h3>A usable-acre map, not more generic “likely” badges.</h3>
        <p>The next spatial analysis should calculate open ground, slope, water constraints, existing improvements and known setbacks across the parcel. Until then, ATLAS will not label horses, cattle, a barn or a homestead as likely from acreage alone.</p>
      </div>
    </div>
  )
}

export function RisksSection({ intelligence, county, parcelVerified }: { intelligence: PropertyIntelligence | null; county: string | null; parcelVerified: boolean }) {
  const rows: Array<{ title: string; status: IntelligenceFinding['status']; value: string; detail: string; action: string }> = []
  if (intelligence) {
    rows.push({ title: 'Flood exposure', status: intelligence.flood.status, value: intelligence.flood.value, detail: intelligence.flood.detail, action: parcelVerified ? 'Run a full-parcel FEMA intersection before relying on this result.' : 'Verify the parcel boundary, then run a full-parcel FEMA intersection.' })
    rows.push({ title: 'Mapped wetlands', status: intelligence.wetlands.status, value: intelligence.wetlands.value, detail: intelligence.wetlands.detail, action: 'Review the entire parcel and obtain field confirmation before disturbing questionable ground.' })
  }
  rows.push({ title: 'Septic / onsite wastewater', status: 'Requires Verification', value: 'System and reserve area are unknown', detail: 'No verified health-department record or system condition is attached to this report.', action: 'Request the installation/permit record, locate the tank and leach field, and inspect when the decision warrants it.' })
  rows.push({ title: 'Zoning & intended use', status: 'Requires Verification', value: `${county ?? 'Local'} controlling jurisdiction is not confirmed`, detail: 'A parcel or MLS zoning label does not prove a specific animal, structure or business use is allowed.', action: 'Confirm the controlling township/county office and ask about the exact intended use, setbacks and permits.' })
  const mappedRows = rows.slice(0, intelligence ? 2 : 0)
  const localRows = rows.slice(intelligence ? 2 : 0)
  const screenedCount = rows.filter((row) => row.status === 'Verified' || row.status === 'Screened' || row.status === 'Likely').length
  const openCount = rows.filter((row) => row.status === 'Requires Verification').length
  const problemCount = rows.filter((row) => row.status === 'Problem').length
  const screenedPercent = rows.length ? Math.round((screenedCount / rows.length) * 100) : 0
  const mappedPercent = mappedRows.length ? Math.round((mappedRows.filter((row) => row.status !== 'Requires Verification').length / mappedRows.length) * 100) : 0
  const localPercent = localRows.length ? Math.round((localRows.filter((row) => row.status !== 'Requires Verification').length / localRows.length) * 100) : 0
  return (
    <div className="data-section">
      <div className="section-heading"><div><p className="eyebrow">RISKS & DUE DILIGENCE</p><h2>What could change the decision?</h2></div><p>Point-level map screens are separated from the open items that still require records, parcel analysis or a professional.</p></div>
      <div className="risk-visual-summary">
        <div className="risk-gauge" role="img" aria-label={`${screenedCount} of ${rows.length} checks screened`}>
          <svg viewBox="0 0 180 105" aria-hidden="true"><path className="gauge-track" pathLength="100" d="M 22 91 A 68 68 0 0 1 158 91" /><path className="gauge-value" pathLength="100" strokeDasharray={`${screenedPercent} 100`} d="M 22 91 A 68 68 0 0 1 158 91" /></svg>
          <div><strong>{screenedCount}<small>/{rows.length}</small></strong><span>CHECKS SCREENED</span></div>
        </div>
        <div className="risk-bars">
          <div className="risk-bar-heading"><div><span>MAPPED SCREENS</span><strong>{mappedRows.filter((row) => row.status !== 'Requires Verification').length}/{mappedRows.length}</strong></div><small>{problemCount ? `${problemCount} red flag${problemCount === 1 ? '' : 's'}` : 'No red flags at point'}</small></div>
          <div className="risk-progress"><i style={{ width: `${mappedPercent}%` }} /></div>
          <div className="risk-bar-heading"><div><span>LOCAL RECORDS</span><strong>{localRows.filter((row) => row.status !== 'Requires Verification').length}/{localRows.length}</strong></div><small>{openCount} open check{openCount === 1 ? '' : 's'}</small></div>
          <div className="risk-progress local"><i style={{ width: `${localPercent}%` }} /></div>
          <p><b>{parcelVerified ? '✓' : '!'}</b>{parcelVerified ? 'Parcel boundary available for the next analysis.' : 'Parcel boundary still needed.'}</p>
        </div>
      </div>
      <div className="risk-grid">
        {rows.map((row) => (
          <article key={row.title} className="risk-card">
            <div><span className="card-kicker">{row.title}</span><strong>{row.value}</strong><p>{row.detail}</p></div>
            <StatusBadge status={row.status} />
            <div className="risk-next"><span>NEXT STEP</span><p>{row.action}</p></div>
          </article>
        ))}
      </div>
    </div>
  )
}

export function HomeValueSection({ parcelVerified, county, record }: { parcelVerified: boolean; county: string | null; record: CountyPropertyRecord | null }) {
  if (record) {
    const dwelling = record.dwelling
    return (
      <div className="data-section">
        <div className="section-heading"><div><p className="eyebrow">HOME & VALUE</p><h2>The county record, without the scavenger hunt.</h2></div><p>These are official county facts. A CMA is a separate market analysis and should not be confused with the auditor's appraisal.</p></div>
        <div className="source-plan-grid">
          <article className="intel-card"><span className="card-kicker">DWELLING</span><h3>{dwelling?.livingArea ? `${dwelling.livingArea.toLocaleString()} sq ft` : 'Dwelling record'}</h3><p>{dwelling ? `${dwelling.bedrooms ?? '—'} bedrooms · ${dwelling.fullBaths ?? '—'} full baths · ${dwelling.stories ?? '—'} story · built ${dwelling.yearBuilt ?? '—'} · ${dwelling.style ?? 'style not listed'}.` : 'Detailed dwelling facts require the county building record.'}</p></article>
          <article className="intel-card"><span className="card-kicker">COUNTY APPRAISAL</span><h3>{money(record.appraisedTotal)}</h3><p>{money(record.appraisedLand)} land + {money(record.appraisedImprovement)} improvements. This is an auditor appraisal, not ATLAS's market-value opinion.</p></article>
          <article className="intel-card"><span className="card-kicker">LAST RECORDED SALE</span><h3>{money(record.salePrice)}</h3><p>{dateLabel(record.saleDate)} · parcel {record.parcelNumber ?? 'not listed'}.</p></article>
        </div>
        <div className="risk-list county-detail-list">
          <article className="risk-row"><div><span className="card-kicker">LAND USE</span><strong>{record.landUse ?? 'Requires verification'}</strong><p>County land-use code {record.landUseCode ?? '—'} · class {record.class ?? '—'}.</p></div><StatusBadge status="Verified" /></article>
          <article className="risk-row"><div><span className="card-kicker">SCHOOL / TAX DISTRICT</span><strong>{record.schoolDistrict ?? '—'}</strong><p>{record.district ?? 'District not listed'}.</p></div><StatusBadge status="Verified" /></article>
          <article className="risk-row"><div><span className="card-kicker">LEGAL DESCRIPTION</span><strong>{record.legalDescription ?? '—'}</strong><p>Source: {record.source}, tax year {record.taxYear}.</p></div><StatusBadge status="Verified" /></article>
          {record.acreageRecordRaw === 0 && <article className="risk-row"><div><span className="card-kicker">ACREAGE CONFLICT</span><strong>County record reports 0.0000 acres</strong><p>ATLAS is intentionally not treating zero as verified parcel acreage. The parcel geometry/land record must be reconciled before rural-use calculations use acreage.</p></div><StatusBadge status="Requires Verification" /></article>}
        </div>
      </div>
    )
  }

  return (
    <div className="data-section">
      <div className="section-heading"><div><p className="eyebrow">HOME & VALUE</p><h2>The home, the record and the market around it.</h2></div><p>This section never invents a CMA from a geocoder. County facts and transfer history come first; MLS-quality comps strengthen the valuation later.</p></div>
      <div className="source-plan-grid">
        <article className="intel-card"><span className="card-kicker">PROPERTY RECORD</span><h3>{parcelVerified ? 'County parcel connected' : `${county ?? 'County'} adapter needed`}</h3><p>Parcel ID, acreage, building facts, assessed/appraised values and transfers belong to the official county/auditor record.</p></article>
        <article className="intel-card"><span className="card-kicker">CMA</span><h3>Rural-weighted comparables</h3><p>ATLAS will weight acreage, living area, age, location, outbuildings, land characteristics and recency instead of pretending suburban comp logic fits acreage homes.</p></article>
        <article className="intel-card"><span className="card-kicker">EVIDENCE</span><h3>Conflicts stay visible</h3><p>If auditor acreage, GIS acreage or another source disagree, ATLAS shows the conflict and source dates rather than silently choosing one.</p></article>
      </div>
    </div>
  )
}

export function CostsSection({ county, record }: { county: string | null; record: CountyPropertyRecord | null }) {
  return (
    <div className="data-section">
      <div className="section-heading"><div><p className="eyebrow">COSTS</p><h2>What will this property cost to carry?</h2></div><p>Purchase price is only one number. Rural decisions need taxes, CAUV, financing and recurring property costs in the same view.</p></div>
      <div className="source-plan-grid">
        <article className="intel-card"><span className="card-kicker">CURRENT COUNTY TAX</span><h3>{record ? money(record.currentTax) : `${county ?? 'County'} tax record`}</h3><p>{record ? `${record.taxYear} county record. Verify current billing with the Treasurer before relying on it for a transaction.` : 'Current taxes, assessed values and transfer history should come from the county record when connected.'}</p></article>
        <article className="intel-card"><span className="card-kicker">CAUV</span><h3>{record ? (record.hasCauv ? 'Currently enrolled' : 'Not enrolled') : 'Enrollment + consequence'}</h3><p>{record ? 'This reflects the current county record. “Could qualify” is a different question and should include eligibility plus recoupment consequences.' : 'ATLAS distinguishes current CAUV enrollment from “could qualify,” shows the tax effect, and flags recoupment/qualification questions.'}</p></article>
        <article className="intel-card"><span className="card-kicker">LAST RECORDED SALE</span><h3>{record ? money(record.salePrice) : 'Carrying costs'}</h3><p>{record ? `${dateLabel(record.saleDate)}. Market value today still requires comparable-sales analysis.` : 'Utilities, insurance, septic/well maintenance, fencing, driveway, outbuildings and land upkeep belong in the ownership picture.'}</p></article>
      </div>
    </div>
  )
}
