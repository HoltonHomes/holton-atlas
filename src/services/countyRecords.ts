export type CountyDwelling = {
  style: string | null
  stories: number | null
  rooms: number | null
  bedrooms: number | null
  fullBaths: number | null
  halfBaths: number | null
  condition: string | null
  yearBuilt: number | null
  heating: string | null
  cooling: string | null
  grade: string | null
  livingArea: number | null
  totalArea: number | null
  dwellingAppraisedValue: number | null
}

export type CountyPropertyRecord = {
  source: string
  checkedAt: string
  propertyId: string | number
  parcelNumber: string | null
  parcelNumberCompact: string | null
  taxYear: string | number | null
  district: string | null
  schoolDistrict: string | null
  landUseCode: string | number | null
  landUse: string | null
  class: string | null
  acres: number | null
  acreageRecordRaw: number | null
  saleDate: string | null
  salePrice: number | null
  appraisedLand: number | null
  appraisedImprovement: number | null
  appraisedTotal: number | null
  assessedLand: number | null
  assessedImprovement: number | null
  assessedTotal: number | null
  hasCauv: boolean
  currentTax: number | null
  legalDescription: string | null
  locationAddress: string | null
  auditorUrl: string | null
  treasurerUrl: string | null
  dwelling: CountyDwelling | null
}

type BrownResponse = {
  ok: boolean
  source?: string
  checkedAt?: string
  record?: Omit<CountyPropertyRecord, 'source' | 'checkedAt'> | null
  error?: string
}

const BROWN_PROPERTY_URL = 'https://kudwonmeleeiikehngfe.supabase.co/functions/v1/brown-property'

export async function getCountyPropertyRecord(county: string | null, address: string): Promise<CountyPropertyRecord | null> {
  if (!county) return null

  if (county.trim().toLowerCase() === 'brown') {
    const url = new URL(BROWN_PROPERTY_URL)
    url.searchParams.set('address', address)
    const response = await fetch(url)
    const data = await response.json() as BrownResponse
    if (!response.ok || !data.ok) throw new Error(data.error || 'Brown County property record unavailable')
    if (!data.record) return null
    return {
      ...data.record,
      source: data.source || 'Brown County Auditor',
      checkedAt: data.checkedAt || new Date().toISOString(),
    }
  }

  return null
}
