import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AtlasValuation } from '../../services/valuationEngine'

function money(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

export default function MarketEvidenceChart({ valuation }: { valuation: AtlasValuation }) {
  const rows = [
    valuation.subjectSaleAdjusted ? { label: 'Subject sale', value: valuation.subjectSaleAdjusted } : null,
    valuation.compIndication ? { label: 'Closed comps', value: valuation.compIndication } : null,
    valuation.avmMedian ? { label: 'AVM median', value: valuation.avmMedian } : null,
    { label: 'ATLAS', value: valuation.estimate },
  ].filter(Boolean) as Array<{ label: string; value: number }>

  const min = Math.min(...rows.map((row) => row.value))
  const max = Math.max(...rows.map((row) => row.value))
  const padding = Math.max(10000, (max - min) * .4)

  return (
    <section className="atlas-chart-card">
      <div className="atlas-chart-heading">
        <div><span className="card-kicker">MARKET EVIDENCE</span><h3>How the signals compare</h3></div>
        <p>These are not four equal opinions. ATLAS weights the closed subject sale most heavily, then reviewed comps, then independent AVMs.</p>
      </div>
      <div className="atlas-chart-frame" role="img" aria-label="Market evidence values compared with the ATLAS estimate">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={rows} margin={{ top: 12, right: 12, bottom: 8, left: 4 }}>
            <CartesianGrid vertical={false} stroke="rgba(28,43,69,.08)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} />
            <YAxis domain={[Math.max(0, min - padding), max + padding]} tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}k`} tickLine={false} axisLine={false} width={52} />
            <Tooltip formatter={(value) => money(Number(value))} cursor={{ fill: 'rgba(217,95,130,.06)' }} />
            <Bar dataKey="value" fill="var(--atlas-rose)" radius={[10, 10, 4, 4]} maxBarSize={72} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="atlas-range-caption"><span>ATLAS likely range</span><strong>{money(valuation.rangeLow)}–{money(valuation.rangeHigh)}</strong></div>
    </section>
  )
}
