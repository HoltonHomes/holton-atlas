import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import { ExtrudeGeometry, Shape } from 'three'
import type { ParcelFeature, LocatedProperty } from '../../services/ohioProperty'
import './atlas-world.css'

type Ring = Array<[number, number]>

function outerRings(parcel: ParcelFeature | null): Ring[] {
  const geometry = parcel?.geometry as { type?: string; coordinates?: unknown } | undefined
  if (!geometry?.coordinates) return []

  if (geometry.type === 'Polygon') {
    const rings = geometry.coordinates as number[][][]
    return rings[0]?.length ? [rings[0].map(([lng, lat]) => [lng, lat])] : []
  }

  if (geometry.type === 'MultiPolygon') {
    const polygons = geometry.coordinates as number[][][][]
    return polygons
      .map((polygon) => polygon[0]?.map(([lng, lat]) => [lng, lat] as [number, number]) ?? [])
      .filter((ring) => ring.length > 2)
  }

  return []
}

function toLocalMeters(ring: Ring, longitude: number, latitude: number) {
  const metersPerDegreeLat = 111_320
  const metersPerDegreeLng = Math.cos(latitude * Math.PI / 180) * 111_320
  return ring.map(([lng, lat]) => [
    (lng - longitude) * metersPerDegreeLng,
    (lat - latitude) * metersPerDegreeLat,
  ] as [number, number])
}

function ParcelMesh({ ring, selected }: { ring: Array<[number, number]>; selected: boolean }) {
  const geometry = useMemo(() => {
    if (ring.length < 3) return null
    const shape = new Shape()
    shape.moveTo(ring[0][0], ring[0][1])
    ring.slice(1).forEach(([x, y]) => shape.lineTo(x, y))
    shape.closePath()
    const next = new ExtrudeGeometry(shape, {
      depth: selected ? 2.4 : 1.4,
      bevelEnabled: true,
      bevelSize: 0.8,
      bevelThickness: 0.5,
      bevelSegments: 3,
    })
    next.center()
    return next
  }, [ring, selected])

  if (!geometry) return null

  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} receiveShadow castShadow>
      <meshStandardMaterial color={selected ? '#d95f82' : '#fff8ef'} roughness={0.78} metalness={0.04} />
    </mesh>
  )
}

export default function AtlasWorld({
  property,
  parcel,
  parcelVerified,
  onClose,
}: {
  property: LocatedProperty
  parcel: ParcelFeature | null
  parcelVerified: boolean
  onClose: () => void
}) {
  const rings = useMemo(() => outerRings(parcel), [parcel])
  const localRings = useMemo(
    () => rings.map((ring) => toLocalMeters(ring, property.longitude, property.latitude)),
    [rings, property.longitude, property.latitude],
  )

  const extent = useMemo(() => {
    const values = localRings.flat()
    if (!values.length) return 80
    return Math.max(80, ...values.flatMap(([x, y]) => [Math.abs(x), Math.abs(y)]))
  }, [localRings])

  return (
    <div className="atlas-world">
      <div className="atlas-world-hud">
        <div>
          <span>ATLAS WORLD · EARLY 3D</span>
          <strong>Orbit the property</strong>
          <small>{parcelVerified ? 'Real parcel geometry' : 'Address-centered scene'} · concept planning is not a survey or approval</small>
        </div>
        <button type="button" onClick={onClose}>Return to map</button>
      </div>

      <Canvas
        className="atlas-world-canvas"
        shadows
        dpr={[1, 1.75]}
        camera={{ position: [extent * 1.05, extent * .9, extent * 1.25], fov: 42, near: 0.1, far: extent * 12 }}
      >
        <color attach="background" args={['#101a2a']} />
        <fog attach="fog" args={['#101a2a', extent * 2.4, extent * 6]} />
        <ambientLight intensity={1.25} />
        <directionalLight
          position={[extent, extent * 1.7, extent * .7]}
          intensity={2.7}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <directionalLight position={[-extent, extent, -extent]} intensity={0.7} color="#f7c6d4" />

        <group position={[0, 1.1, 0]}>
          {localRings.length > 0 ? localRings.map((ring, index) => (
            <ParcelMesh key={index} ring={ring} selected={index === 0} />
          )) : (
            <mesh receiveShadow castShadow>
              <cylinderGeometry args={[28, 28, 2, 64]} />
              <meshStandardMaterial color="#d95f82" roughness={0.78} />
            </mesh>
          )}

          <mesh position={[0, 5, 0]} castShadow>
            <cylinderGeometry args={[0.7, 1.2, 10, 20]} />
            <meshStandardMaterial color="#fff8ef" emissive="#d95f82" emissiveIntensity={0.35} />
          </mesh>
          <mesh position={[0, 10.6, 0]} castShadow>
            <sphereGeometry args={[1.8, 28, 28]} />
            <meshStandardMaterial color="#d95f82" emissive="#d95f82" emissiveIntensity={0.55} />
          </mesh>
        </group>

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.2, 0]} receiveShadow>
          <planeGeometry args={[extent * 7, extent * 7, 1, 1]} />
          <meshStandardMaterial color="#17253a" roughness={1} />
        </mesh>
        <gridHelper args={[extent * 5, 36, '#3c506d', '#263852']} position={[0, -1.05, 0]} />
        <ContactShadows position={[0, -0.95, 0]} opacity={0.36} scale={extent * 3} blur={2.3} far={extent * 2} />
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.065}
          minDistance={Math.max(32, extent * .5)}
          maxDistance={extent * 4.5}
          maxPolarAngle={Math.PI / 2.02}
          target={[0, 0, 0]}
        />
      </Canvas>

      <div className="atlas-world-controls">
        <span><b>Drag</b> orbit</span>
        <span><b>Scroll</b> zoom</span>
        <span><b>Right drag</b> pan</span>
      </div>
      <div className="atlas-world-address">{property.address}</div>
    </div>
  )
}
