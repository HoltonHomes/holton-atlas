import { z } from 'zod'

export const sourceSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  type: z.string().min(1),
  role: z.string().min(1),
})

export const researchProfileSchema = z.object({
  display_address: z.string().min(1),
  county: z.string().nullable(),
  parcel_number: z.string().nullable(),
  facts: z.record(z.string(), z.unknown()),
  sources: z.array(sourceSchema),
  reviewed_at: z.string(),
  review_status: z.enum(['researched', 'needs_review', 'stale']),
})

export const geoJsonGeometrySchema = z.object({
  type: z.enum(['Polygon', 'MultiPolygon']),
  coordinates: z.unknown(),
})

export type ValidatedResearchProfile = z.infer<typeof researchProfileSchema>
