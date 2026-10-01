import { useState } from 'react'
import { METHOD_BY_KEY, fmtMs, fmtPct, fmtTokens, NA } from '../lib/methods'
import ProbabilityBars from './ProbabilityBars'
import { Dot, Spinner } from './Primitives'

function Row({ label, children, mono }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </dt>
      <dd className={`text-right text-xs font-medium ${mono ? 'num' : ''}`}>{children}</dd>
    </div>
  )
}

function Verdict({ result }) {
  if (!result.ground_truth) return null
  const ok = result.correct
  return (
    <div
      className="mt-3 rounded-md border p-2.5 text-xs"
      style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span style={{ color: 'var(--text-secondary)' }}>Ground Truth</span>
        <span className="font-semibold">{result.ground_truth}</span>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <span style={{ color: 'var(--text-secondary)' }}>Prediction</span>
        <span className="font-semibold">{result.decision ?? '— none produced —'}</span>
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-2 border-t pt-1.5" style={{ borderColor: 'var(--border)' }}>
        <span style={{ color: 'var(--text-secondary)' }}>Result</span>
        <span className="font-semibold" style={{ color: ok ? 'var(--status-good)' : 'var(--status-critical)' }}>
          {ok ? '✓ Correct' : '✗ Incorrect'}
        </span>
      </div>
    </div>
  )
}

export default function ResultCard({ methodKey, result, running, error }) {
  const [showDetail, setShowDetail] = useState(false)
  const meta = METHOD_BY_KEY[methodKey]

  const statusText = running
    ? 'Running'
    : error
      ? 'Error'
      : !result
        ? 'Not run'
        : !result.parse_ok
          ? 'Parse failed'
          : 'Complete'

  const statusColor = error || result?.parse_ok === false ? 'var(--status-critical)' : running ? 'var(--status-warning)' : result ? 'var(--status-good)' : 'var(--muted)'

  return (
    <article className="card flex flex-col p-4">
      <header className="flex items-start justify-between gap-2 border-b pb-3" style={{ borderColor: 'var(--border)' }}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Dot color={meta.color} />
            <h3 className="truncate text-sm font-semibold">{meta.name}</h3>
            {result?.mode === 'demo' && (
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide"
                style={{ background: 'var(--status-warning)', color: '#0b0b0b' }}
              >
                DEMO
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--muted)' }}>
            {meta.summary}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium" style={{ color: statusColor }}>
          {running ? <Spinner /> : <Dot color={statusColor} />}
          {statusText}
        </span>
      </header>

      {error && (
        <p className="mt-3 text-xs" style={{ color: 'var(--status-critical)' }}>
          {error}
        </p>
      )}

      {!result && !error && (
        <p className="mt-6 text-center text-xs" style={{ color: 'var(--muted)' }}>
          {running ? 'Waiting for the model…' : 'No run yet.'}
        </p>
      )}

      {result && (
        <>
          <div className="mt-3">
            <div className="label">Decision</div>
            <div className="mt-0.5 text-2xl font-semibold">
              {result.decision ?? <span style={{ color: 'var(--status-critical)' }}>none</span>}
            </div>
          </div>

          <dl className="mt-3 divide-y" style={{ borderColor: 'var(--border)' }}>
            <Row label="Latency" mono>
              {fmtMs(result.latency_ms)}
              {result.mode === 'demo' && (
                <span className="ml-1 font-normal" style={{ color: 'var(--muted)' }}>
                  (demo heuristic)
                </span>
              )}
            </Row>
            <Row label="Generated tokens" mono>
              {fmtTokens(result.generated_tokens)}
            </Row>
            <Row label="Confidence" mono>
              {result.confidence === null || result.confidence === undefined ? (
                <span style={{ color: 'var(--muted)' }}>{NA}</span>
              ) : (
                fmtPct(result.confidence, 1)
              )}
            </Row>
            <Row label="Human review">
              {result.needs_human_review === null || result.needs_human_review === undefined ? (
                <span style={{ color: 'var(--muted)' }}>{NA}</span>
              ) : result.needs_human_review ? (
                <span style={{ color: 'var(--status-warning)' }}>⚑ Review</span>
              ) : (
                <span style={{ color: 'var(--status-good)' }}>Auto-decide</span>
              )}
            </Row>
          </dl>

          {result.probabilities ? (
            <div className="mt-4">
              <div className="label mb-2">Probability Distribution</div>
              <ProbabilityBars probabilities={result.probabilities} accent={meta.color} />
            </div>
          ) : (
            <div
              className="mt-4 rounded-md border border-dashed p-3 text-[11px] leading-relaxed"
              style={{ borderColor: 'var(--baseline)', color: 'var(--muted)' }}
            >
              <span className="label block" style={{ color: 'var(--muted)' }}>
                Probability Distribution
              </span>
              <span className="mt-1.5 block">
                None. This method emits an answer, not a score — there is nothing to distribute across the
                decision space.
              </span>
            </div>
          )}

          <Verdict result={result} />

          {result.review_reason && (
            <p className="mt-2 text-[11px] leading-relaxed" style={{ color: 'var(--muted)' }}>
              {result.review_reason}
            </p>
          )}

          <button
            type="button"
            onClick={() => setShowDetail((v) => !v)}
            className="mt-3 self-start text-[11px] underline underline-offset-2"
            style={{ color: 'var(--text-secondary)' }}
          >
            {showDetail ? 'Hide details' : 'Show details'}
          </button>

          {showDetail && (
            <div className="mt-2 space-y-2 text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              <p>
                <span className="label">Engine</span>
                <br />
                {result.engine_label}
              </p>
              {result.note && (
                <p>
                  <span className="label">Note</span>
                  <br />
                  {result.note}
                </p>
              )}
              {result.error && (
                <p style={{ color: 'var(--status-critical)' }}>
                  <span className="label">Parse error</span>
                  <br />
                  {result.error}
                </p>
              )}
              {result.raw_output != null && (
                <div>
                  <span className="label">Raw model output</span>
                  <pre
                    className="mt-1 overflow-x-auto rounded border p-2 font-mono text-[10px]"
                    style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                  >
                    {result.raw_output || '(empty)'}
                  </pre>
                </div>
              )}
              {result.ground_truth_reason && (
                <p>
                  <span className="label">Why this is the ground truth</span>
                  <br />
                  {result.ground_truth_reason}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </article>
  )
}
