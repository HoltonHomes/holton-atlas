export type ResearchProfile = {
  display_address: string
  county: string | null
  parcel_number: string | null
  facts: Record<string, any>
  sources: Array<{ name: string; url: string; type: string; role: string }>
  reviewed_at: string
  review_status: 'researched' | 'needs_review' | 'stale'
}

const SUPABASE_URL = 'https://kudwonmeleeiikehngfe.supabase.co'
// Supabase publishable keys are intentionally safe for browser use. RLS still controls access.
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_O86_YirdnITaVOlb9KOcTA_PKAT8j-n'

function normalizeAddress(value: string) {
  return value
    .toUpperCase()
    .replace(/\bSTREET\b/g, 'ST')
    .replace(/\bROAD\b/g, 'RD')
    .replace(/\bAVENUE\b/g, 'AVE')
    .replace(/\bDRIVE\b/g, 'DR')
    .replace(/\bLANE\b/g, 'LN')
    .replace(/\bCOURT\b/g, 'CT')
    .replace(/\bBOULEVARD\b/g, 'BLVD')
    .replace(/[.,#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function getResearchProfile(address: string): Promise<ResearchProfile | null> {
  const normalized = normalizeAddress(address)
  const url = new URL(`${SUPABASE_URL}/rest/v1/property_research_profiles`)
  url.searchParams.set('normalized_address', `eq.${normalized}`)
  url.searchParams.set('published', 'eq.true')
  url.searchParams.set('select', 'display_address,county,parcel_number,facts,sources,reviewed_at,review_status')
  url.searchParams.set('limit', '1')

  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    },
  })

  if (!response.ok) return null
  const rows = await response.json() as ResearchProfile[]
  return rows[0] ?? null
}

export function researchNumber(profile: ResearchProfile | null, path: string[]): number | null {
  let value: any = profile?.facts
  for (const key of path) value = value?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function researchText(profile: ResearchProfile | null, path: string[]): string | null {
  let value: any = profile?.facts
  for (const key of path) value = value?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
