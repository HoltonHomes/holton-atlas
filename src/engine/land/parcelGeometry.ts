import area from '@turf/area'
import bbox from '@turf/bbox'
import booleanIntersects from '@turf/boolean-intersects'
import intersect from '@turf/intersect'
import { feature, featureCollection } from '@turf/helpers'
import type { Feature, Geometry, Polygon, MultiPolygon } from 'geojson'

const SQ_METERS_PER_ACRE = 4046.8564224

export type ParcelGeometry = Polygon | MultiPolygon

export function toFeature(geometry: ParcelGeometry): Feature<ParcelGeometry> {
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

export function isParcelGeometry(value: Geometry | null | undefined): value is ParcelGeometry {
  return value?.type === 'Polygon' || value?.type === 'MultiPolygon'
}
