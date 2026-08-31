import { motion } from 'motion/react'
import type { PropertyIntelligence } from '../services/propertyIntelligence'

type Status = 'Public record' | 'Map clue' | 'Needs confirmation' | 'Problem'

type ResearchRow = {
  topic: string
  status: Status
  finding: string
  why: string
  next: string
}

function statusFromFinding(status: string | undefined): Status {
  if (status === 'Problem') return 'Problem'
  if (status === 'Verified') return 'Public record'
  if (status === 'Screened' || status === 'Likely') return 'Map clue'
  return 'Needs confirmation'
}

export default function PropertyResearch({
  intelligence,
  parcelVerified,
  acres,
  zoning,
  county,
  hasCauv,
}: {
  intelligence: PropertyIntelligence | null
  parcelVerified: boolean
  acres: number | null
  zoning: string | null
  county: string | null
  hasCauv: boolean | null
}) {
  const rows: ResearchRow[] = [
    {
      topic: 'Recorded parcel',
      status: parcelVerified ? 'Public record' : 'Needs confirmation',
      finding: parcelVerified ? `${acres ? `${acres.toFixed(2)} acres · ` : ''}Recorded parcel outline is available.` : `${acres ? `${acres.toFixed(2)} acres are recorded, but ` : ''}ATLAS has not verified a parcel outline yet.`,
      why: 'Boundaries, usable land and every mapped layer depend on matching the right parcel.',
      next: parcelVerified ? 'Treat the outline as a mapping representation, not a boundary survey.' : 'Verify the parcel with the county GIS/auditor and a survey when boundary certainty matters.',
    },
    {
      topic: 'Flood mapping',
      status: statusFromFinding(intelligence?.flood?.status),
      finding: intelligence?.flood?.value ?? 'ATLAS could not verify flood mapping yet.',
      why: 'Flood exposure can affect use, insurance, financing and where improvements make sense.',
      next: intelligence?.flood?.detail ?? 'Check FEMA mapping and parcel-wide exposure before relying on the result.',
    },
    {
      topic: 'Wetlands',
      status: statusFromFinding(intelligence?.wetlands?.status),
      finding: intelligence?.wetlands?.value ?? 'ATLAS could not verify mapped wetlands yet.',
      why: 'Mapped wetlands can affect where land may be practical to disturb, build on or drain.',
      next: intelligence?.wetlands?.detail ?? 'Use NWI only as screening evidence; field/jurisdictional confirmation may still be needed.',
    },
    {
      topic: 'Soils',
      status: intelligence?.soil?.status === 'Verified' ? 'Map clue' : statusFromFinding(intelligence?.soil?.status),
      finding: intelligence?.soil?.value ?? 'ATLAS could not verify USDA soil information yet.',
      why: 'Soil mapping can help screen for drainage, gardening, forage, structures and other land-use questions.',
      next: intelligence?.soil?.detail ?? 'Use mapped soil as planning evidence, not as a substitute for site-specific testing.',
    },
    {
      topic: 'Terrain & slope',
      status: statusFromFinding(intelligence?.terrain?.status),
      finding: intelligence?.terrain?.value ?? 'ATLAS could not verify terrain information yet.',
      why: 'Slope and landform influence drainage, access, pasture, driveways and potential building areas.',
      next: intelligence?.terrain?.detail ?? 'Inspect the land in person and verify grades when a project depends on them.',
    },
    {
      topic: 'Local rules',
      status: 'Needs confirmation',
      finding: zoning ? `${zoning} zoning reference found.` : 'No verified local zoning answer yet.',
      why: 'A zoning label alone does not settle animals, accessory buildings, setbacks, home businesses or other uses.',
      next: `Confirm the actual proposed use with the applicable ${county ? `${county} County / local` : 'local'} jurisdiction before acting.`,
    },
    {
      topic: 'Septic / sewer',
      status: 'Needs confirmation',
      finding: 'System type and exact field/tank location are not verified in the current ATLAS evidence set.',
      why: 'Septic location can remove the exact area someone imagined for a barn, addition, garden, driveway or pond.',
      next: 'Locate records, ask the seller, and use the appropriate inspection/health-department process before relying on a site plan.',
    },
    {
      topic: 'Well / water',
      status: 'Needs confirmation',
      finding: 'Water source, well details and production/quality are not fully verified in the current evidence set.',
      why: 'Country-property ownership can depend heavily on water source, reliability, quality and livestock/garden needs.',
      next: 'Confirm the water source and obtain the appropriate records/testing when the property relies on a private well.',
    },
    {
      topic: 'Access & easements',
      status: 'Needs confirmation',
      finding: 'Legal access, shared/private-road obligations and easements are not settled by the map alone.',
      why: 'Access affects everyday use, maintenance, trailers/equipment and sometimes financing or future improvements.',
      next: 'Review deed/title/survey information and ask specifically about private-road maintenance and recorded easements.',
    },
    {
      topic: 'CAUV / agricultural tax treatment',
      status: hasCauv === true ? 'Needs confirmation' : hasCauv === false ? 'Public record' : 'Needs confirmation',
      finding: hasCauv === true ? 'County record indicates CAUV/agricultural treatment.' : hasCauv === false ? 'Current county extract does not show CAUV enrollment.' : 'CAUV status is not verified.',
      why: 'Agricultural tax treatment can materially change carrying costs and may create recoupment questions when use or ownership changes.',
      next: 'Confirm current enrollment, eligibility and any potential recoupment directly with the county before relying on the tax treatment.',
    },
  ]

  const verifyCount = rows.filter((row) => row.status === 'Needs confirmation' || row.status === 'Problem').length

  return (
    <section className="property-research-workspace">
      <div className="client-workspace-heading">
        <div><span>PROPERTY RESEARCH</span><h2>What we know, what the maps suggest, and what still needs checked.</h2></div>
        <p>ATLAS does not hide uncertainty. Public records, map clues and unresolved questions stay visibly different so the next step is obvious.</p>
      </div>

      <div className="research-priority-banner">
        <div><span>OPEN QUESTIONS</span><strong>{verifyCount}</strong></div>
        <p>These are not automatic deal-breakers. They are the items worth resolving before you rely on the property for a specific plan, price or purchase decision.</p>
      </div>

      <div className="research-row-list">
        {rows.map((row, index) => (
          <motion.article key={row.topic} className={`research-row ${row.status.toLowerCase().replaceAll(' ', '-')}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .035 }}>
            <div className="research-row-status"><span>{row.status}</span><strong>{row.topic}</strong></div>
            <div><span>WHAT ATLAS FOUND</span><p>{row.finding}</p></div>
            <div><span>WHY IT MATTERS</span><p>{row.why}</p></div>
            <div><span>WHAT TO DO NEXT</span><p>{row.next}</p></div>
          </motion.article>
        ))}
      </div>

      <section className="field-check-panel">
        <div><span>WHEN YOU ARE AT THE PROPERTY</span><strong>Use ATLAS as a field checklist, not just a report.</strong></div>
        <div className="field-check-grid">
          <label><input type="checkbox" /> Look for where water sits after rain</label>
          <label><input type="checkbox" /> Locate septic tank / drainfield if applicable</label>
          <label><input type="checkbox" /> Confirm water source / well head</label>
          <label><input type="checkbox" /> Walk likely property boundaries</label>
          <label><input type="checkbox" /> Check trailer / equipment access</label>
          <label><input type="checkbox" /> Check cell signal and internet options</label>
          <label><input type="checkbox" /> Inspect fencing and outbuildings</label>
          <label><input type="checkbox" /> Ask what changes in wet weather / winter</label>
        </div>
      </section>
    </section>
  )
}
