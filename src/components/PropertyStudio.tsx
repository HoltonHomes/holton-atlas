import { useState, type CSSProperties } from 'react'
import type { LocatedProperty, ParcelFeature } from '../services/ohioProperty'
import type { PropertyIntelligence } from '../services/propertyIntelligence'
import PropertyMap from './PropertyMap'
import PlanConfigurator from './PlanConfigurator'
import './property-studio.css'

function percent(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}%` : '—'
}

function constraintLabel(value: number | null | undefined, clearLabel: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Not available'
  return value > 0 ? `${value.toFixed(1)}% mapped` : clearLabel
}

export default function PropertyStudio({
  property,
  parcel,
  parcelVerified,
  intelligence,
  acres,
  zoningKnown,
}: {
  property: LocatedProperty
  parcel: ParcelFeature | null
  parcelVerified: boolean
  intelligence: PropertyIntelligence | null
  acres: number | null
  zoningKnown: boolean
}) {
  const [plannerOpen, setPlannerOpen] = useState(false)
  const analysis = intelligence?.parcelAnalysis ?? null
  const slope = analysis?.slope ?? null
  const flood = analysis?.flood ?? null
  const wetlands = analysis?.wetlands ?? null
  const water = analysis?.water ?? null
  const parcelSize = analysis?.parcelAcres ?? acres
  const floodPercent = flood ? Math.max(flood.sfhaPercent, flood.mappedPercent) : null
  const gentle = slope?.under5Percent ?? null
  const checkedAt = analysis?.checkedAt ?? intelligence?.checkedAt

  return (
    <section className="property-studio">
      <header className="property-studio-heading">
        <div>
          <span>ATLAS PROPERTY STUDIO</span>
          <h2>See the property. Test the idea.</h2>
        </div>
        <div className="studio-heading-note">
          <strong>{analysis ? 'Parcel-wide model ready' : parcelVerified ? 'Parcel located · analysis loading' : 'Address view · parcel needed'}</strong>
          <small>{analysis ? 'Mapped land evidence is drawn from the recorded parcel.' : 'Explore the location now. Parcel placement unlocks when the boundary is available.'}</small>
        </div>
      </header>
      <div className="property-studio-stage">
        <div className="property-studio-map">
          <div className="studio-map-label">
            <span>INTERACTIVE LAND CANVAS</span>
            <strong>{property.address}</strong>
          </div>
          {plannerOpen ? (
            <div className="studio-map-paused">
              <span>PLANNER OPEN</span>
              <strong>This map moved to the planner below.</strong>
              <p>Only one live map runs at a time — close the planner to come back to the browse view.</p>
            </div>
          ) : (
            <PropertyMap property={property} parcel={parcel} parcelVerified={parcelVerified} />
          )}
        </div>

        <aside className="studio-intelligence-rail">
          <div className="studio-rail-topline">
            <span>LAND READ</span>
            <b>{analysis ? 'PARCEL' : 'SCREEN'}</b>
          </div>

          <div className="studio-acreage">
            <strong>{parcelSize ? parcelSize.toFixed(2) : '—'}</strong>
            <span>{parcelSize ? 'mapped acres' : 'parcel acres pending'}</span>
          </div>
          <div className="studio-slope-read">
            <div
              className={gentle == null ? 'studio-gauge pending' : 'studio-gauge'}
              style={{ '--atlas-gauge': `${gentle ?? 0}%` } as CSSProperties}
              aria-label={gentle == null ? 'Parcel slope pending' : `${gentle.toFixed(1)} percent under five degrees slope`}
            >
              <div><strong>{gentle == null ? '—' : Math.round(gentle)}</strong><span>{gentle == null ? 'pending' : '% gentle'}</span></div>
            </div>
            <div><span>TERRAIN</span><strong>{slope ? `${percent(slope.over10Percent)} steep` : intelligence?.terrain.value ?? 'Not loaded'}</strong><small>{slope ? `${percent(slope.fiveTo10Percent)} moderate slope` : 'Parcel-wide slope will replace the point reading.'}</small></div>
          </div>

          <div className="studio-constraint-list">
            <div>
              <span><i className="flood" />Flood</span>
              <strong>{constraintLabel(floodPercent, 'No mapped overlap')}</strong>
              <b><i style={{ width: `${Math.min(100, floodPercent ?? 0)}%` }} /></b>
            </div>
            <div>
              <span><i className="wetland" />Wetlands</span>
              <strong>{constraintLabel(wetlands?.mappedPercent, 'No mapped overlap')}</strong>
              <b><i style={{ width: `${Math.min(100, wetlands?.mappedPercent ?? 0)}%` }} /></b>
            </div>
            <div>
              <span><i className="water" />Surface water</span>
              <strong>{water ? water.waterbodyPercent > 0 ? `${percent(water.waterbodyPercent)} mapped` : water.streamCount ? `${water.streamCount} mapped line${water.streamCount === 1 ? '' : 's'}` : 'No mapped feature' : 'Not available'}</strong>
              <b><i style={{ width: `${Math.min(100, water?.waterbodyPercent ?? 0)}%` }} /></b>
            </div>
          </div>
          <button className="studio-plan-button" type="button" onClick={() => setPlannerOpen((open) => !open)} aria-expanded={plannerOpen}>
            <span>{plannerOpen ? '×' : '+'}</span>
            <div><strong>{plannerOpen ? 'Close site planner' : 'Plan on this property'}</strong><small>Place a barn, garden, pasture, pond or drive</small></div>
          </button>

          <footer>
            <span>{parcelVerified ? 'Recorded parcel located' : 'Address located'}</span>
            <small>{checkedAt ? `Evidence checked ${new Date(checkedAt).toLocaleDateString()}` : 'Evidence still loading'}</small>
          </footer>
        </aside>
      </div>

      {plannerOpen ? (
        <div className="studio-planner-drawer">
          <PlanConfigurator property={property} parcel={parcel} parcelVerified={parcelVerified} intelligence={intelligence} acres={acres} zoningKnown={zoningKnown} />
        </div>
      ) : null}
    </section>
  )
}
