import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CATEGORIES, fmtPct } from '../../lib/methods'
import { InfoTip } from '../Primitives'

/**
 * Jev-style probability distribution for one ticket.
 *
 * Single-series magnitude chart: one hue with emphasis on the winning category.
 * Colouring each category differently would spend the hue channel duplicating
 * information the bar length already carries.
 */
function DistTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div
      className="rounded-md border px-2.5 py-2 text-xs shadow-lg"
      style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}
    >
      <div className="font-semibold">{d.name}</div>
      <div className="num mt-0.5" style={{ color: 'var(--text-secondary)' }}>
        {fmtPct(d.value, 2)}
      </div>
    </div>
  )
}

export default function ProbabilityChart({ probabilities, title = 'Jev probability distribution', subtitle, height = 230 }) {
  if (!probabilities) {
    return (
      <figure className="card p-4 sm:p-5">
        <figcaption className="text-sm font-semibold">{title}</figcaption>
        <p className="py-10 text-center text-xs" style={{ color: 'var(--muted)' }}>
          Run the Jev-style method on a ticket to see its distribution.
        </p>
      </figure>
    )
  }

  const topCat = Object.entries(probabilities).reduce((a, b) => (b[1] > a[1] ? b : a))[0]
  const data = CATEGORIES.map((c) => ({ name: c, value: probabilities[c] ?? 0, top: c === topCat }))

  return (
    <figure className="card p-4 sm:p-5">
      <figcaption className="mb-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          {title}
          <InfoTip label="About this distribution">
            Relative probabilities across the five declared choices only. They are not calibrated real-world
            probabilities.
          </InfoTip>
        </h3>
        {subtitle && (
          <p className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
            {subtitle}
          </p>
        )}
      </figcaption>

      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 48, left: 0, bottom: 0 }}
            barCategoryGap="26%"
          >
            <CartesianGrid horizontal={false} stroke="var(--grid)" strokeDasharray="0" />
            <XAxis
              type="number"
              domain={[0, 1]}
              tick={{ fontSize: 10, fill: 'var(--muted)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--baseline)' }}
              tickFormatter={(v) => `${Math.round(v * 100)}%`}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 11, fill: 'var(--muted)' }}
              tickLine={false}
              axisLine={false}
              width={74}
            />
            <Tooltip content={<DistTooltip />} cursor={{ fill: 'var(--surface-2)' }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
              <LabelList
                dataKey="value"
                position="right"
                offset={8}
                formatter={(v) => fmtPct(v, v < 0.1 ? 1 : 0)}
                style={{ fontSize: 11, fontWeight: 600, fill: 'var(--text-primary)' }}
              />
              {data.map((d) => (
                <Cell key={d.name} fill={d.top ? 'var(--series-3)' : 'var(--baseline)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
