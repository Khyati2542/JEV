import { METHODS, fmtMs, fmtPct, fmtTokens, NA } from '../lib/methods'
import { Dot, InfoTip } from './Primitives'

/**
 * Methods are always shown in their fixed order. Nothing here is sorted by
 * value, scored, or marked as a winner - the table exists so the tradeoffs can
 * be inspected side by side.
 */
const ROWS = [
  {
    key: 'latency',
    label: 'Latency',
    get: (r) => (r ? fmtMs(r.latency_ms) : NA),
  },
  {
    key: 'tokens',
    label: 'Generated tokens',
    get: (r) => (r ? fmtTokens(r.generated_tokens) : NA),
    tip: 'Tokens the model actually sampled, as reported by the local server. "N/A" means the server did not report a count - it is never estimated.',
  },
  {
    key: 'decision',
    label: 'Decision',
    get: (r) => (r ? (r.decision ?? '— none —') : NA),
  },
  {
    key: 'confidence',
    label: 'Confidence',
    get: (r) => (r && r.confidence != null ? fmtPct(r.confidence, 1) : NA),
    tip: 'Free generation produces no per-choice score, so Normal and Structured have no confidence value. This is a property of the method, not a measurement failure.',
  },
  {
    key: 'correct',
    label: 'Correct / Incorrect',
    get: (r) => {
      if (!r) return NA
      if (r.ground_truth == null) return '— no ground truth —'
      return r.correct ? '✓ Correct' : '✗ Incorrect'
    },
    color: (r) => (r?.ground_truth == null ? undefined : r.correct ? 'var(--status-good)' : 'var(--status-critical)'),
  },
  {
    key: 'review',
    label: 'Human review',
    get: (r) => {
      if (!r) return NA
      if (r.needs_human_review == null) return NA
      return r.needs_human_review ? '⚑ Review' : 'Auto-decide'
    },
    color: (r) =>
      r?.needs_human_review == null ? undefined : r.needs_human_review ? 'var(--status-warning)' : 'var(--status-good)',
  },
]

export default function ComparisonTable({ results }) {
  const any = METHODS.some((m) => results[m.key])
  if (!any) return null

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <caption className="sr-only">
          Method comparison for the current support request. Methods are listed in a fixed order and are not ranked.
        </caption>
        <thead>
          <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
            <th scope="col" className="label py-2.5 pr-4 text-left">
              Metric
            </th>
            {METHODS.map((m) => (
              <th key={m.key} scope="col" className="py-2.5 pr-4 text-left text-xs font-semibold">
                <span className="inline-flex items-center gap-1.5">
                  <Dot color={m.color} />
                  {m.name}
                </span>
                {results[m.key]?.mode === 'demo' && (
                  <span className="ml-1.5 text-[10px] font-bold" style={{ color: 'var(--status-warning)' }}>
                    DEMO
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.key} className="border-b" style={{ borderColor: 'var(--border)' }}>
              <th scope="row" className="py-2.5 pr-4 text-left text-xs font-normal" style={{ color: 'var(--text-secondary)' }}>
                <span className="inline-flex items-center gap-1.5">
                  {row.label}
                  {row.tip && <InfoTip label={`About ${row.label}`}>{row.tip}</InfoTip>}
                </span>
              </th>
              {METHODS.map((m) => {
                const r = results[m.key]
                const color = row.color?.(r)
                return (
                  <td
                    key={m.key}
                    className="num py-2.5 pr-4 text-xs font-medium"
                    style={color ? { color } : r ? undefined : { color: 'var(--muted)' }}
                  >
                    {row.get(r)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
