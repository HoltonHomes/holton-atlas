import { motion } from 'motion/react'
import type { PropertyIntelligence } from '../services/propertyIntelligence'

function percent(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}%` : '—'
}

function acres(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)} ac` : '—'
}

export default function LandAtGlance({ intelligence }: { intelligence: PropertyIntelligence | null }) {
  if (!intelligence) return null

  const analysis = intelligence.parcelAnalysis
  const flood = analysis?.flood ?? null
  const wetlands = analysis?.wetlands ?? null
  const soils = analysis?.soils ?? null

  const floodHeadline = flood
    ? flood.sfhaPercent > 0
      ? `${percent(flood.sfhaPercent)} mapped FEMA SFHA`
      : flood.mappedPercent > 0
        ? `${percent(flood.mappedPercent)} mapped flood overlap`
        : 'No mapped FEMA overlap'
    : intelligence.flood.value

  const wetlandHeadline = wetlands
    ? wetlands.mappedPercent > 0
      ? `${percent(wetlands.mappedPercent)} mapped wetland overlap`
      : 'No mapped NWI overlap'
    : intelligence.wetlands.value

  const soilHeadline = soils?.dominantUnit
    ? `${soils.dominantUnit.name}`
    : intelligence.soil.value

  return (
    <section className={analysis ? 'land-at-glance parcel-wide' : 'land-at-glance point-level'}>
      <div className="land-glance-heading">
        <div>
          <span>{analysis ? 'PARCEL-WIDE LAND SCREEN' : 'LAND SCREENING'}</span>
          <h3>{analysis ? 'What the mapped land data says about this parcel.' : 'What ATLAS can tell from the evidence available so far.'}</h3>
        </div>
        <p>{analysis
          ? `ATLAS matched the recorded parcel and calculated mapped overlap against approximately ${analysis.parcelAcres.toFixed(2)} acres. These layers can overlap each other and do not equal “unusable acreage.”`
          : 'Some environmental findings are still based on the geocoded address point. ATLAS keeps that limitation visible instead of pretending the whole parcel was analyzed.'}</p>
      </div>

      <div className="land-glance-grid">
        <motion.article initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="land-glance-top"><span>FLOOD</span><i className={intelligence.flood.status === 'Problem' ? 'attention' : 'screened'} /></div>
          <strong>{floodHeadline}</strong>
          <p>{flood
            ? flood.sfhaPercent > 0
              ? `${acres(flood.sfhaAcres)} of the mapped parcel intersects a Special Flood Hazard Area.`
              : flood.mappedPercent > 0
                ? `${acres(flood.mappedAcres)} intersects available FEMA flood-hazard mapping.`
                : 'The available FEMA polygon layer did not intersect the recorded parcel geometry.'
            : intelligence.flood.detail}</p>
          <small>{flood?.zones?.length ? `Mapped zones: ${flood.zones.join(', ')}` : intelligence.flood.source}</small>
        </motion.article>

        <motion.article initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .05 }}>
          <div className="land-glance-top"><span>WETLANDS</span><i className={wetlands?.mappedPercent ? 'verify' : 'screened'} /></div>
          <strong>{wetlandHeadline}</strong>
          <p>{wetlands
            ? wetlands.mappedPercent > 0
              ? `${acres(wetlands.mappedAcres)} overlaps National Wetlands Inventory mapping.`
              : 'The available National Wetlands Inventory layer did not intersect the recorded parcel geometry.'
            : intelligence.wetlands.detail}</p>
          <small>{wetlands?.types?.length ? wetlands.types.slice(0, 3).join(' · ') : intelligence.wetlands.source}</small>
        </motion.article>

        <motion.article initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .1 }}>
          <div className="land-glance-top"><span>SOILS</span><i className="screened" /></div>
          <strong>{soilHeadline}</strong>
          <p>{soils?.dominantUnit
            ? `${acres(soils.dominantUnit.acres)} · ${percent(soils.dominantUnit.percent)} of the mapped parcel${soils.units.length > 1 ? ` · ${soils.units.length} mapped soil units found` : ''}.`
            : intelligence.soil.detail}</p>
          <small>{soils?.dominantUnit?.farmland ? `Farmland class: ${soils.dominantUnit.farmland}` : intelligence.soil.source}</small>
        </motion.article>

        <motion.article initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .15 }}>
          <div className="land-glance-top"><span>TERRAIN</span><i className="verify" /></div>
          <strong>{intelligence.terrain.value}</strong>
          <p>{intelligence.terrain.detail}</p>
          <small>Terrain is still screening-level; parcel-wide slope/elevation sampling comes next.</small>
        </motion.article>
      </div>

      {soils?.units && soils.units.length > 1 ? (
        <details className="soil-unit-details">
          <summary>See mapped soil breakdown</summary>
          <div className="soil-unit-list">
            {soils.units.map((unit) => (
              <div key={`${unit.symbol ?? ''}-${unit.name}`}>
                <span>{unit.symbol ?? 'Soil unit'}</span>
                <strong>{unit.name}</strong>
                <b>{acres(unit.acres)} · {percent(unit.percent)}</b>
                <small>{[unit.farmland, unit.capability ? `Capability ${unit.capability}` : null].filter(Boolean).join(' · ') || 'USDA mapped soil unit'}</small>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <div className="land-glance-limit">
        <strong>What this does not prove</strong>
        <p>GIS parcel lines are not surveys. Flood and wetland layers are mapped screening sources. Soil mapping is not a site-specific soil, septic or engineering test. ATLAS uses these results to tell you what deserves a closer look—not to approve a use.</p>
      </div>
    </section>
  )
}
