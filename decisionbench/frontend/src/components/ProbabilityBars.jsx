import { CATEGORIES, CATEGORY_TO_LABEL, fmtPct } from '../lib/methods'

/**
 * Probability distribution across the five declared choices.
 *
 * Single-series magnitude chart: one hue for every bar with EMPHASIS on the
 * winning category, rather than a colour per category - the bar length already
 * carries the value, so hue is spent on "which one won" instead of duplicating
 * it. Every bar is directly labelled, so no value depends on colour or hover.
 */
export default function ProbabilityBars({ probabilities, accent = 'var(--accent)', compact = false }) {
  if (!probabilities) return null
  const top = Object.entries(probabilities).reduce((a, b) => (b[1] > a[1] ? b : a))

  return (
    <ul className="space-y-1.5" aria-label="Probability across the decision space">
      {CATEGORIES.map((cat) => {
        const p = probabilities[cat] ?? 0
        const isTop = cat === top[0]
        return (
          <li key={cat} className="flex items-center gap-2.5">
            <span
              className="w-[4.5rem] shrink-0 text-right text-xs"
              style={{ color: isTop ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: isTop ? 600 : 400 }}
            >
              {cat}
            </span>
            <span
              className="hidden w-4 shrink-0 text-center text-[10px] num sm:block"
              style={{ color: 'var(--muted)' }}
              aria-hidden="true"
            >
              {CATEGORY_TO_LABEL[cat]}
            </span>
            <span
              className="relative min-w-0 flex-1 overflow-hidden rounded-sm"
              style={{ height: compact ? 8 : 10, background: 'var(--surface-2)' }}
            >
              <span
                className="absolute inset-y-0 left-0 rounded-sm transition-[width] duration-300"
                style={{
                  // Absolute 0-100% scale, never normalised to the row maximum,
                  // so a 25% bar is a quarter of the track in every card and a
                  // flat distribution reads as flat.
                  width: `${Math.max(p * 100, p > 0 ? 1.5 : 0)}%`,
                  background: isTop ? accent : 'var(--baseline)',
                }}
              />
            </span>
            <span
              className="w-11 shrink-0 text-right text-xs num"
              style={{ color: isTop ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: isTop ? 600 : 400 }}
            >
              {fmtPct(p, p < 0.1 ? 1 : 0)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
