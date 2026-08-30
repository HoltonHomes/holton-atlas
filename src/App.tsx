import { FormEvent, useState } from 'react'

const capabilities = [
  'Value & CMA',
  'Taxes & CAUV',
  'Parcel & Aerial',
  'Terrain & Topography',
  'Soils & Water',
  'Rural Potential',
]

function App() {
  const [address, setAddress] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!address.trim()) return
    window.alert(`ATLAS property analysis is being wired next for: ${address.trim()}`)
  }

  return (
    <main className="site-shell">
      <nav className="nav-shell" aria-label="Primary navigation">
        <a className="brand" href="/" aria-label="ATLAS home">
          <span className="brand-mark">A</span>
          <span>
            <strong>ATLAS</strong>
            <small>by Holton Homes</small>
          </span>
        </a>
        <span className="nav-status">Property Intelligence</span>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">PROPERTY INTELLIGENCE · GREATER CINCINNATI</p>
          <h1>Understand the property beyond the listing.</h1>
          <p className="lede">
            Research the home, land, taxes, terrain, soil, water and rural potential in one clear property report.
          </p>

          <form className="search-card" onSubmit={handleSubmit}>
            <label htmlFor="property-address">Search a property</label>
            <div className="search-row">
              <input
                id="property-address"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="Enter a street address"
                autoComplete="street-address"
              />
              <button type="submit">Analyze property</button>
            </div>
            <p>ATLAS will separate verified records, calculated findings and items that still require verification.</p>
          </form>
        </div>

        <aside className="preview-card" aria-label="ATLAS report preview">
          <div className="preview-map">
            <span className="parcel parcel-one" />
            <span className="parcel parcel-two" />
            <span className="map-label">PROPERTY MAP</span>
          </div>
          <div className="preview-content">
            <p className="mini-label">ATLAS REPORT</p>
            <h2>One property. The full picture.</h2>
            <div className="status-grid">
              <span><b>✓</b> Verified records</span>
              <span><b>◉</b> Likely uses</span>
              <span><b>?</b> Verify locally</span>
              <span><b>!</b> Potential problems</span>
            </div>
          </div>
        </aside>
      </section>

      <section className="capability-strip" aria-label="ATLAS capabilities">
        {capabilities.map((capability) => (
          <span key={capability}>{capability}</span>
        ))}
      </section>

      <section className="principle">
        <div>
          <p className="eyebrow">BUILT FOR RURAL DECISIONS</p>
          <h2>Not just “what is this property?” — “what could I actually do here?”</h2>
        </div>
        <div className="use-grid">
          {['🐓 Poultry', '🐐 Goats', '🐎 Horses', '🐄 Cattle', '🥕 Market garden', '🌳 Orchard', '🏡 Homestead', '🚜 Hobby farm'].map((use) => (
            <div className="use-card" key={use}>{use}</div>
          ))}
        </div>
      </section>
    </main>
  )
}

export default App
