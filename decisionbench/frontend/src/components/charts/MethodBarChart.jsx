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
import { METHODS, NA } from '../../lib/methods'
import { InfoTip } from '../Primitives'

/**
 * One measure, four methods.
 *
 * - Bars are always in the fixed method order. Never sorted by value, so the
 *   chart cannot be read as a ranking.
 * - Hue identifies the method and is the same in every chart and card, so
 *   filtering or re-rendering never repaints a method a different colour.
 * - Every bar is directly labelled, so no value depends on hover or on colour.
 * - A method whose value could not be measured is listed underneath as N/A
 *   rather than being drawn as a zero-height bar.
 */
function ChartTooltip({ active, payload, unit }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div
      className="rounded-md border px-2.5 py-2 text-xs shadow-lg"
      style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}
    >
      <div className="font-semibold">{d.name}</div>
      <div className="num mt-0.5" style={{ color: 'var(--text-secondary)' }}>
        {d.label}
        {unit ? ` ${unit}` : ''}
      </div>
    </div>
  )
}

export default function MethodBarChart({
  title,
  subtitle,
  tip,
  rows, // { [methodKey]: { value: number|null, label: string } }
  domain,
  tickFormatter,
  height = 232,
}) {
  const data = METHODS.filter((m) => rows[m.key]?.value != null).map((m) => ({
    key: m.key,
    name: m.name,
    color: m.color,
    value: rows[m.key].value,
    label: rows[m.key].label,
  }))

  const missing = METHODS.filter((m) => rows[m.key] && rows[m.key].value == null)

  return (
    <figure className="card p-4 sm:p-5">
      <figcaption className="mb-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          {title}
          {tip && <InfoTip label={`About ${title}`}>{tip}</InfoTip>}
        </h3>
        {subtitle && (
          <p className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
            {subtitle}
          </p>
        )}
      </figcaption>

      {data.length === 0 ? (
        <p className="py-10 text-center text-xs" style={{ color: 'var(--muted)' }}>
          No measured values for this metric.
        </p>
      ) : (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 20, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
              <CartesianGrid vertical={false} stroke="var(--grid)" strokeDasharray="0" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: 'var(--muted)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--baseline)' }}
                interval={0}
              />
              <YAxis
                domain={domain}
                tick={{ fontSize: 10, fill: 'var(--muted)' }}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={tickFormatter}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--surface-2)' }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={64} isAnimationActive={false}>
                <LabelList
                  dataKey="label"
                  position="top"
                  offset={8}
                  style={{ fontSize: 11, fontWeight: 600, fill: 'var(--text-primary)' }}
                />
                {data.map((d) => (
                  <Cell key={d.key} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {missing.length > 0 && (
        <p className="mt-2 text-[11px]" style={{ color: 'var(--muted)' }}>
          {NA} for {missing.map((m) => m.name).join(', ')} — not measurable for this method.
        </p>
      )}
    </figure>
  )
}
