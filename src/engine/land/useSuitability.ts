import type { PropertyIntelligence, IntelligenceFinding, IntelligenceStatus } from '../../services/propertyIntelligence'
import type { PlannerName } from '../../components/PropertyMap'

export type SuitabilityOutcome = 'Promising' | 'Possible with checks' | 'Concern' | 'Insufficient data'
export type SuitabilityConfidence = 'Low' | 'Moderate'

export type SuitabilityEvidence = {
  label: string
  status: IntelligenceStatus | 'Known' | 'Unknown'
  value: string
  detail: string
  source?: string
}

export type SuitabilityResult = {
  use: PlannerName
  outcome: SuitabilityOutcome
  confidence: SuitabilityConfidence
  headline: string
  explanation: string
  evidence: SuitabilityEvidence[]
  blockers: string[]
  verifyNext: string[]
  limitations: string[]
}

export type SuitabilityInputs = {
  use: PlannerName
  acres: number | null
  parcelVerified: boolean
  zoningKnown: boolean
  intelligence: PropertyIntelligence | null
}

type UseRule = {
  title: string
  relevant: Array<keyof PropertyIntelligence>
  verify: string[]
  acreageConcernBelow?: number
  acreageConcernText?: string
}

const USE_RULES: Record<PlannerName, UseRule> = {
  Barn: {
    title: 'Barn / outbuilding',
    relevant: ['flood', 'wetlands', 'terrain'],
    verify: ['Local zoning/use rules', 'Required setbacks', 'Septic, well and utility locations', 'Access for construction and vehicles'],
  },
  Garden: {
    title: 'Garden',
    relevant: ['soil', 'terrain', 'flood'],
    verify: ['Sun exposure on the intended area', 'Water source and irrigation access', 'Drainage after heavy rain'],
  },
  Poultry: {
    title: 'Poultry / coop',
    relevant: ['flood', 'terrain'],
    verify: ['Local animal/zoning rules', 'Required setbacks', 'Drainage around the coop/run', 'Predator-safe enclosure location'],
  },
  Pasture: {
    title: 'Pasture',
    relevant: ['soil', 'flood', 'wetlands', 'terrain'],
    verify: ['Usable fenced acreage', 'Water access', 'Drainage and seasonal wetness', 'Local livestock rules'],
    acreageConcernBelow: 1,
    acreageConcernText: 'The parcel may be too tight for meaningful pasture once the home, septic, access and other improvements are accounted for.',
  },
  Goats: {
    title: 'Goats',
    relevant: ['soil', 'flood', 'wetlands', 'terrain'],
    verify: ['Local livestock rules', 'Secure fencing plan', 'Shelter location', 'Water access', 'Usable area after septic/setbacks'],
    acreageConcernBelow: 0.75,
    acreageConcernText: 'Limited acreage may constrain fencing, rotation and separation from the home/septic area.',
  },
  Orchard: {
    title: 'Orchard',
    relevant: ['soil', 'terrain', 'flood'],
    verify: ['Sun exposure', 'Drainage', 'Water access during establishment', 'Species/rootstock fit for the site'],
  },
  Pond: {
    title: 'Pond',
    relevant: ['wetlands', 'flood', 'terrain'],
    verify: ['Detailed topography and drainage area', 'Soil/seepage suitability', 'Wetland impacts', 'Permits and downstream impacts'],
  },
  Driveway: {
    title: 'Driveway / access',
    relevant: ['terrain', 'flood', 'wetlands'],
    verify: ['Road authority access approval', 'Sight distance', 'Culvert/drainage needs', 'Grade along the proposed alignment'],
  },
}

function evidenceFromFinding(finding: IntelligenceFinding): SuitabilityEvidence {
  return {
    label: finding.label,
    status: finding.status,
    value: finding.value,
    detail: finding.detail,
    source: finding.source,
  }
}

function isConcern(status: IntelligenceStatus) {
  return status === 'Problem'
}

function needsVerification(status: IntelligenceStatus) {
  return status === 'Requires Verification'
}

export function evaluateLandUse(inputs: SuitabilityInputs): SuitabilityResult {
  const rule = USE_RULES[inputs.use]
  const evidence: SuitabilityEvidence[] = []
  const blockers: string[] = []
  const verifyNext = [...rule.verify]
  const limitations: string[] = []

  if (inputs.parcelVerified) {
    evidence.push({ label: 'Parcel', status: 'Known', value: 'Parcel geometry available', detail: 'ATLAS has a parcel boundary to use as the planning frame.' })
  } else {
    evidence.push({ label: 'Parcel', status: 'Unknown', value: 'Parcel geometry not verified', detail: 'ATLAS cannot reliably judge placement against the property boundary yet.' })
    verifyNext.unshift('Verify the official parcel boundary')
  }

  if (inputs.acres != null) {
    evidence.push({ label: 'Recorded acreage', status: 'Known', value: `${inputs.acres.toFixed(2)} acres`, detail: 'Recorded acreage describes parcel size, not necessarily usable acreage.' })
    if (rule.acreageConcernBelow && inputs.acres < rule.acreageConcernBelow) {
      blockers.push(rule.acreageConcernText ?? 'Limited acreage may constrain this use.')
    }
  } else {
    evidence.push({ label: 'Recorded acreage', status: 'Unknown', value: 'Not verified', detail: 'Usable area cannot be judged until parcel acreage is established.' })
  }

  if (inputs.zoningKnown) {
    evidence.push({ label: 'Zoning reference', status: 'Known', value: 'Reference available', detail: 'A zoning reference is available, but ATLAS has not verified that this specific proposed use is permitted.' })
  } else {
    evidence.push({ label: 'Zoning / local rules', status: 'Unknown', value: 'Requires verification', detail: 'ATLAS does not yet have enough local-rule evidence to say this use is permitted.' })
    verifyNext.unshift('Verify whether this use is allowed locally')
  }

  if (!inputs.intelligence) {
    limitations.push('Land intelligence has not loaded, so ATLAS cannot screen mapped soil, flood, wetlands or terrain signals.')
  } else {
    for (const key of rule.relevant) {
      if (key === 'checkedAt') continue
      const finding = inputs.intelligence[key]
      if (!finding || typeof finding === 'string') continue
      evidence.push(evidenceFromFinding(finding))
      if (isConcern(finding.status)) blockers.push(`${finding.label}: ${finding.value}`)
      if (needsVerification(finding.status)) verifyNext.push(`Verify ${finding.label.toLowerCase()} conditions on the intended area`)
    }
  }

  limitations.push('Current environmental findings are screening-level and may be point-based rather than full-parcel intersections.')
  limitations.push('ATLAS does not yet know exact septic, well, easement, utility, setback or building-envelope locations unless separately verified.')

  const unknownCount = evidence.filter((item) => item.status === 'Unknown' || item.status === 'Requires Verification').length
  const mappedConcernCount = evidence.filter((item) => item.status === 'Problem').length

  let outcome: SuitabilityOutcome
  let headline: string
  let explanation: string

  if (mappedConcernCount > 0 || blockers.length > 0) {
    outcome = 'Concern'
    headline = `${rule.title}: investigate before planning around it`
    explanation = blockers[0] ?? 'ATLAS found a condition that could materially affect this use.'
  } else if (!inputs.parcelVerified || !inputs.intelligence || unknownCount >= 3) {
    outcome = 'Insufficient data'
    headline = `${rule.title}: not enough verified information yet`
    explanation = 'ATLAS can identify the right questions, but it does not have enough evidence to call this a good fit yet.'
  } else if (unknownCount > 0 || !inputs.zoningKnown) {
    outcome = 'Possible with checks'
    headline = `${rule.title}: nothing obvious rules it out yet`
    explanation = 'The available evidence does not show a clear blocker, but important local or site-specific checks remain.'
  } else {
    outcome = 'Promising'
    headline = `${rule.title}: available evidence looks workable`
    explanation = 'ATLAS does not see a clear issue in the evidence currently available. This is still a planning signal, not an approval.'
  }

  const confidence: SuitabilityConfidence = inputs.parcelVerified && inputs.intelligence && unknownCount <= 1 ? 'Moderate' : 'Low'

  return {
    use: inputs.use,
    outcome,
    confidence,
    headline,
    explanation,
    evidence,
    blockers,
    verifyNext: [...new Set(verifyNext)].slice(0, 6),
    limitations,
  }
}
