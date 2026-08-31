import { area, bbox, booleanIntersects, feature, featureCollection, intersect } from '@turf/turf'

const SQ_METERS_PER_ACRE = 4046.8564224

export type ParcelGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] }

export function toFeature(geometry: ParcelGeometry) {
  return feature(geometry)
}

export function parcelAcres(geometry: ParcelGeometry): number {
  return area(toFeature(geometry)) / SQ_METERS_PER_ACRE
}

export function parcelBounds(geometry: ParcelGeometry): [number, number, number, number] {
  return bbox(toFeature(geometry)) as [number, number, number, number]
}

export function overlapAcres(parcel: ParcelGeometry, overlay: ParcelGeometry): number {
  const parcelFeature = toFeature(parcel)
  const overlayFeature = toFeature(overlay)
  if (!booleanIntersects(parcelFeature, overlayFeature)) return 0

  const clipped = intersect(featureCollection([parcelFeature, overlayFeature]))
  return clipped ? area(clipped) / SQ_METERS_PER_ACRE : 0
}

export function overlapPercent(parcel: ParcelGeometry, overlay: ParcelGeometry): number {
  const total = parcelAcres(parcel)
  if (total <= 0) return 0
  return Math.min(100, Math.max(0, (overlapAcres(parcel, overlay) / total) * 100))
}

export function isParcelGeometry(value: { type?: string } | null | undefined): value is ParcelGeometry {
  return value?.type === 'Polygon' || value?.type === 'MultiPolygon'
}
