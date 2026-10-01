/**
 * Client-side aggregation for the live benchmark run.
 *
 * Mirrors backend/benchmark.py exactly so a browser run and a scripted
 * POST /api/benchmark produce the same numbers. Nothing is estimated: a metric
 * with no measured values is null and renders as "N/A".
 *
 * Accuracy is correct / total. A parse failure counts as not-correct, because
 * failing to produce a usable answer is a real outcome, not missing data.
 */
const DIFFICULTIES = ['easy', 'medium', 'hard']

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

const pct = (xs, q) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]
}

export function summarise(method, rows) {
  const total = rows.length
  const lat = rows.map((r) => r.latency_ms).filter((v) => v != null)
  const tok = rows.map((r) => r.generated_tokens).filter((v) => v != null)
  const conf = rows.map((r) => r.confidence).filter((v) => v != null)
  const review = rows.map((r) => r.needs_human_review).filter((v) => v != null)

  const accuracyByDifficulty = {}
  for (const level of DIFFICULTIES) {
    const subset = rows.filter((r) => r.difficulty === level)
    accuracyByDifficulty[level] = subset.length
      ? subset.filter((r) => r.correct === true).length / subset.length
      : null
  }

  return {
    method,
    total,
    engineLabel: rows[0]?.engine_label ?? '',
    mode: rows[0]?.mode ?? 'demo',
    decided: rows.filter((r) => r.decision).length,
    parseFailures: rows.filter((r) => r.parse_ok === false).length,
    correct: rows.filter((r) => r.correct === true).length,
    accuracy: total ? rows.filter((r) => r.correct === true).length / total : null,
    accuracyByDifficulty,
    avgLatencyMs: mean(lat),
    p50LatencyMs: pct(lat, 0.5),
    p95LatencyMs: pct(lat, 0.95),
    avgGeneratedTokens: tok.length ? mean(tok) : null,
    totalGeneratedTokens: tok.length ? tok.reduce((a, b) => a + b, 0) : null,
    avgConfidence: conf.length ? mean(conf) : null,
    humanReviewRate: review.length ? review.filter(Boolean).length / review.length : null,
    humanReviewCount: review.length ? review.filter(Boolean).length : null,
    lowConfidenceCases: conf.length ? conf.filter((c) => c < 0.5).length : null,
    confidenceAvailable: conf.length > 0,
  }
}

/** The run's most ambiguous ticket by Jev top-two margin - the interesting one. */
export function closestCall(rows) {
  let best = null
  for (const r of rows) {
    if (!r.probabilities) continue
    const sorted = Object.values(r.probabilities).sort((a, b) => b - a)
    const margin = (sorted[0] ?? 0) - (sorted[1] ?? 0)
    if (!best || margin < best.margin) best = { margin, row: r }
  }
  return best?.row ?? null
}

export function toCsv(records) {
  const cols = [
    'timestamp',
    'run_id',
    'method',
    'mode',
    'ticket_id',
    'difficulty',
    'ground_truth',
    'decision',
    'correct',
    'latency_ms',
    'generated_tokens',
    'confidence',
    'needs_human_review',
    'parse_ok',
  ]
  const esc = (v) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(','), ...records.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n')
}

export function download(filename, content, type = 'application/json') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
