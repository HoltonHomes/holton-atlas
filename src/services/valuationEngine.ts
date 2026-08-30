import type { ResearchProfile } from './researchProfile'

export type ValuationEvidenceRow = {
  label: string
  value: number
  weight: number
  detail: string
}

export type AtlasValuation = {
  estimate: number
  rangeLow: number
  rangeHigh: number
  confidence: 'High' | 'Moderate' | 'Low'
  subjectSaleAdjusted: number | null
  subjectSaleOriginal: number | null
  subjectSaleDate: string | null
  marketTrendAnnualPct: number | null
  compIndication: number | null
  avmMedian: number | null
  evidence: ValuationEvidenceRow[]
  note: string
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  if (!sorted.length) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function weightedMean(rows: Array<{ value: number; weight: number }>) {
  const weight = rows.reduce((sum, row) => sum + row.weight, 0)
  if (!weight) return null
  return rows.reduce((sum, row) => sum + row.value * row.weight, 0) / weight
}

function monthsBetween(dateString: string, now: Date) {
  const then = new Date(dateString)
  if (Number.isNaN(then.getTime())) return null
  return Math.max(0, (now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24 * 30.4375))
}

function saleWeightForAge(months: number | null, configuredWeight: number) {
  if (months == null) return configuredWeight
  if (months <= 6) return Math.max(configuredWeight, 0.7)
  if (months <= 18) return Math.max(configuredWeight, 0.6)
  if (months <= 30) return Math.min(configuredWeight, 0.55)
  if (months <= 48) return Math.min(configuredWeight, 0.4)
  return Math.min(configuredWeight, 0.25)
}

function roundTo(value: number, step: number) {
  return Math.round(value / step) * step
}

export function buildAtlasValuation(profile: ResearchProfile | null, now = new Date()): AtlasValuation | null {
  const inputs = profile?.facts?.valuationEvidence
  if (!inputs) return null

  const subjectSale = inputs.subjectSale ?? {}
  const weights = inputs.weights ?? {}
  const marketTrend = inputs.marketTrend ?? {}
  const salePrice = finiteNumber(subjectSale.price)
  const saleDate = typeof subjectSale.closeDate === 'string' ? subjectSale.closeDate : null
  const annualTrendPct = finiteNumber(marketTrend.qualityAdjustedAnnualPct)
  const months = saleDate ? monthsBetween(saleDate, now) : null

  let saleAdjusted: number | null = null
  if (salePrice) {
    if (annualTrendPct != null && months != null) {
      const years = Math.min(months, 36) / 12
      const cappedAnnualRate = Math.max(-0.06, Math.min(0.06, annualTrendPct / 100))
      saleAdjusted = salePrice * Math.pow(1 + cappedAnnualRate, years)
    } else {
      saleAdjusted = salePrice
    }
  }

  const comps = Array.isArray(inputs.closedComps) ? inputs.closedComps : []
  const validComps = comps
    .map((comp: any) => ({
      value: finiteNumber(comp.adjustedIndication),
      weight: finiteNumber(comp.qualityWeight) ?? 1,
    }))
    .filter((comp: { value: number | null; weight: number }) => comp.value != null && comp.weight > 0) as Array<{ value: number; weight: number }>
  const compIndication = weightedMean(validComps)

  const avms = Array.isArray(inputs.avms) ? inputs.avms : []
  const seenGroups = new Set<string>()
  const avmValues: number[] = []
  for (const avm of avms) {
    const group = typeof avm?.independentGroup === 'string' ? avm.independentGroup : String(avm?.provider ?? avmValues.length)
    const value = finiteNumber(avm?.value)
    if (value == null || seenGroups.has(group)) continue
    seenGroups.add(group)
    avmValues.push(value)
  }
  const avmMedian = median(avmValues)

  const configuredSaleWeight = finiteNumber(weights.recentClosedSubjectSale) ?? 0.6
  const configuredCompWeight = finiteNumber(weights.closedComparableSales) ?? 0.25
  const configuredAvmWeight = finiteNumber(weights.independentAvmConsensus) ?? 0.15
  const effectiveSaleWeight = saleWeightForAge(months, configuredSaleWeight)

  const rawEvidence: ValuationEvidenceRow[] = []
  if (saleAdjusted != null) {
    rawEvidence.push({
      label: 'Closed subject sale, time-adjusted',
      value: saleAdjusted,
      weight: effectiveSaleWeight,
      detail: saleDate
        ? `Closed ${saleDate}. Time adjustment uses the reviewed local quality-adjusted market trend, capped to avoid runaway index moves.`
        : 'Recent closed sale used as the primary market anchor.',
    })
  }
  if (compIndication != null) {
    rawEvidence.push({
      label: 'Adjusted closed comparable sales',
      value: compIndication,
      weight: configuredCompWeight,
      detail: `${validComps.length} reviewed closed comps, weighted for similarity and adjusted before aggregation.`,
    })
  }
  if (avmMedian != null) {
    rawEvidence.push({
      label: 'Independent AVM consensus',
      value: avmMedian,
      weight: configuredAvmWeight,
      detail: `${avmValues.length} independent provider groups. Median is used so one extreme AVM cannot dominate.`,
    })
  }

  if (!rawEvidence.length) return null
  const totalWeight = rawEvidence.reduce((sum, row) => sum + row.weight, 0)
  const evidence = rawEvidence.map((row) => ({ ...row, weight: row.weight / totalWeight }))
  const estimateRaw = evidence.reduce((sum, row) => sum + row.value * row.weight, 0)

  const evidenceValues = evidence.map((row) => row.value)
  const spread = Math.max(...evidenceValues) - Math.min(...evidenceValues)
  const uncertainty = Math.max(estimateRaw * 0.08, spread * 0.55)
  const estimate = roundTo(estimateRaw, 1000)
  const rangeLow = Math.max(0, roundTo(estimateRaw - uncertainty, 5000))
  const rangeHigh = roundTo(estimateRaw + uncertainty, 5000)

  let confidence: AtlasValuation['confidence'] = 'Low'
  if (saleAdjusted != null && compIndication != null && avmMedian != null) confidence = spread / estimateRaw <= 0.18 ? 'Moderate' : 'Low'
  if (saleAdjusted != null && validComps.length >= 3 && avmValues.length >= 3 && spread / estimateRaw <= 0.12) confidence = 'High'

  return {
    estimate,
    rangeLow,
    rangeHigh,
    confidence,
    subjectSaleAdjusted: saleAdjusted ? roundTo(saleAdjusted, 1000) : null,
    subjectSaleOriginal: salePrice,
    subjectSaleDate: saleDate,
    marketTrendAnnualPct: annualTrendPct,
    compIndication: compIndication ? roundTo(compIndication, 1000) : null,
    avmMedian: avmMedian ? roundTo(avmMedian, 1000) : null,
    evidence,
    note: typeof inputs.policyNote === 'string'
      ? inputs.policyNote
      : 'ATLAS weights observed closed-market evidence above automated estimates and excludes county tax appraisal from market-value weighting.',
  }
}
