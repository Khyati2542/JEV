import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import api from '../api/client'
import { closestCall, download, summarise, toCsv } from '../lib/aggregate'
import {
  METHODS,
  METHOD_BY_KEY,
  METHOD_KEYS,
  NA,
  fmtMs,
  fmtNum,
  fmtPct,
  fmtTokens,
} from '../lib/methods'
import MethodBarChart from '../components/charts/MethodBarChart'
import ProbabilityChart from '../components/charts/ProbabilityChart'
import { Card, Dot, InfoTip, Notice, Spinner, Stat } from '../components/Primitives'

const FAIRNESS = [
  'the same 54 tickets, in the same order',
  'the same ticket text, unmodified',
  'the same five choices, in the same order',
  'the same model and the same local server',
  'the same human-review thresholds',
]

/** Stands in for a chart we deliberately refuse to draw, at the chart's height. */
function SuppressedChart({ title, children }) {
  return (
    <figure className="card p-4 sm:p-5">
      <figcaption className="mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
          Suppressed in demo mode
        </p>
      </figcaption>
      <div
        className="grid place-items-center rounded-md border border-dashed px-6 text-center text-xs leading-relaxed"
        style={{ height: 232, borderColor: 'var(--baseline)', color: 'var(--muted)' }}
      >
        <p className="max-w-sm">{children}</p>
      </div>
    </figure>
  )
}

export default function BenchmarkPage({ health, thresholds }) {
  const [tickets, setTickets] = useState([])
  const [selected, setSelected] = useState(METHOD_KEYS)
  const [records, setRecords] = useState([])
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [runId, setRunId] = useState(null)
  const [error, setError] = useState(null)
  const [running, setRunning] = useState(false)
  const [focusTicket, setFocusTicket] = useState(null)
  const abort = useRef(false)

  useEffect(() => {
    api.tickets().then(setTickets).catch((e) => setError(e.message))
  }, [])

  const byMethod = useMemo(() => {
    const out = {}
    for (const k of METHOD_KEYS) out[k] = records.filter((r) => r.method === k)
    return out
  }, [records])

  const summaries = useMemo(() => {
    const out = {}
    for (const k of selected) if (byMethod[k]?.length) out[k] = summarise(k, byMethod[k])
    return out
  }, [byMethod, selected])

  const jevRows = byMethod.jev ?? []
  const focus = useMemo(() => {
    if (focusTicket) return jevRows.find((r) => r.ticket_id === focusTicket) ?? null
    return closestCall(jevRows)
  }, [jevRows, focusTicket])

  const isDemo = records.some((r) => r.mode === 'demo') || health?.mode === 'demo'

  const run = useCallback(async () => {
    if (!tickets.length || !selected.length) return
    abort.current = false
    setRunning(true)
    setError(null)
    setRecords([])
    setFocusTicket(null)
    const id = `ui_${Date.now().toString(36)}`
    setRunId(id)
    setProgress({ done: 0, total: tickets.length * selected.length })

    const collected = []
    let done = 0

    // Sequential: one request at a time, so latency reflects the model rather
    // than queue contention. This is the same order the backend uses.
    outer: for (const t of tickets) {
      for (const method of selected) {
        if (abort.current) break outer
        try {
          const res = await api.decide(method, {
            ticket_id: t.id,
            min_top: thresholds.minTop,
            min_margin: thresholds.minMargin,
          })
          collected.push({
            ...res,
            run_id: id,
            difficulty: t.difficulty,
            text: t.text,
          })
        } catch (e) {
          setError(`${t.id} / ${method}: ${e.message}`)
        }
        done += 1
        setProgress({ done, total: tickets.length * selected.length })
        setRecords([...collected])
      }
    }
    setRunning(false)
  }, [tickets, selected, thresholds])

  const chartRows = (pick) =>
    Object.fromEntries(METHOD_KEYS.map((k) => [k, summaries[k] ? pick(summaries[k]) : undefined]))

  const totalCorrect = Object.values(summaries).reduce((a, s) => a + s.correct, 0)
  const totalRows = Object.values(summaries).reduce((a, s) => a + s.total, 0)

  return (
    <div className="space-y-5">
      {isDemo && (
        <Notice tone="warning" title="DEMO MODE — these are not model measurements.">
          No local model server is answering, so Normal LLM, Structured and Jev-style rows below come from a
          deterministic stand-in. Latency and token charts are suppressed because there is no model to
          measure. Start SGLang and re-run for real numbers.
        </Notice>
      )}

      <Card
        title="Benchmark"
        subtitle={`Run every selected method against all ${tickets.length || '…'} labelled tickets and compare the measurements.`}
        right={
          records.length > 0 && (
            <div className="flex gap-2">
              <button
                type="button"
                className="btn px-2.5 py-1.5 text-xs"
                onClick={() => download(`decisionbench_${runId}.json`, JSON.stringify({ runId, thresholds, records }, null, 2))}
              >
                JSON
              </button>
              <button
                type="button"
                className="btn px-2.5 py-1.5 text-xs"
                onClick={() => download(`decisionbench_${runId}.csv`, toCsv(records), 'text/csv')}
              >
                CSV
              </button>
            </div>
          )
        }
      >
        <fieldset className="mb-4">
          <legend className="label mb-2">Methods</legend>
          <div className="flex flex-wrap gap-3">
            {METHODS.map((m) => (
              <label key={m.key} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(m.key)}
                  disabled={running}
                  onChange={(e) =>
                    setSelected((prev) =>
                      e.target.checked
                        ? METHOD_KEYS.filter((k) => prev.includes(k) || k === m.key)
                        : prev.filter((k) => k !== m.key),
                    )
                  }
                  className="accent-[var(--accent)]"
                />
                <Dot color={m.color} />
                {m.name}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={run}
            disabled={running || !tickets.length || !selected.length}
            className="btn btn-primary"
          >
            {running && <Spinner />}
            Run {tickets.length || ''} Tickets
          </button>
          {running && (
            <button type="button" className="btn" onClick={() => (abort.current = true)}>
              Stop
            </button>
          )}
          <span className="text-xs num" style={{ color: 'var(--text-secondary)' }}>
            thresholds: top ≥ {thresholds.minTop.toFixed(2)}, margin ≥ {thresholds.minMargin.toFixed(2)}
          </span>
        </div>

        {progress.total > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-xs num" style={{ color: 'var(--text-secondary)' }}>
              <span>
                {progress.done} / {progress.total} decisions
              </span>
              <span>{Math.round((progress.done / progress.total) * 100)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--surface-2)' }}>
              <div
                className="h-full rounded-full transition-[width] duration-200"
                style={{ width: `${(progress.done / progress.total) * 100}%`, background: 'var(--accent)' }}
              />
            </div>
          </div>
        )}

        {error && (
          <p className="mt-3 text-xs" style={{ color: 'var(--status-critical)' }}>
            {error}
          </p>
        )}

        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Benchmark fairness &amp; reproducibility
          </summary>
          <div className="mt-2 space-y-2 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            <p>Every method in a run sees:</p>
            <ul className="list-disc space-y-0.5 pl-5">
              {FAIRNESS.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <p>
              Requests are issued one at a time so latency measures the model rather than queue contention.
              Normal LLM and Structured are given byte-identical prompts, so the only variable between them is
              the decoding constraint. Jev-style necessarily differs in its final instruction (“return only the
              label” instead of “reply with JSON”) because that is the mechanism under test; everything before
              that line is identical.
            </p>
            <p>
              Every decision is appended to <code>runs/decisions.jsonl</code> on the backend with its
              timestamp, method, ticket id, prediction, ground truth, latency, confidence and token count. The
              JSON/CSV buttons export the same rows from this run.
            </p>
          </div>
        </details>
      </Card>

      {records.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Total examples" value={tickets.length} hint={`${selected.length} methods per ticket`} />
            <Stat label="Decisions recorded" value={records.length} hint={`run ${runId}`} />
            <Stat
              label="Correct predictions"
              value={totalCorrect}
              hint={`out of ${totalRows} across all selected methods`}
            />
            <Stat
              label="Mode"
              value={isDemo ? 'DEMO' : 'LIVE'}
              accent={isDemo ? 'var(--status-warning)' : 'var(--status-good)'}
              hint={isDemo ? 'deterministic stand-in' : health?.model}
            />
          </div>

          <Card
            title="Per-method results"
            subtitle="Fixed order, no ranking. Read the columns against each other rather than looking for a best row."
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                    {[
                      'Method',
                      'Accuracy',
                      'Correct',
                      'Avg latency',
                      'p95 latency',
                      'Avg tokens',
                      'Total tokens',
                      'Human review',
                      'Low confidence',
                      'Parse failures',
                    ].map((h) => (
                      <th key={h} scope="col" className="label py-2.5 pr-4 text-left">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {METHODS.filter((m) => summaries[m.key]).map((m) => {
                    const s = summaries[m.key]
                    return (
                      <tr key={m.key} className="border-b" style={{ borderColor: 'var(--border)' }}>
                        <th scope="row" className="py-2.5 pr-4 text-left text-xs font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            <Dot color={m.color} />
                            {m.name}
                          </span>
                        </th>
                        <td className="num py-2.5 pr-4 text-xs font-semibold">{fmtPct(s.accuracy, 1)}</td>
                        <td className="num py-2.5 pr-4 text-xs">
                          {s.correct} / {s.total}
                        </td>
                        <td className="num py-2.5 pr-4 text-xs">{fmtMs(s.avgLatencyMs)}</td>
                        <td className="num py-2.5 pr-4 text-xs">{fmtMs(s.p95LatencyMs)}</td>
                        <td className="num py-2.5 pr-4 text-xs">{fmtNum(s.avgGeneratedTokens)}</td>
                        <td className="num py-2.5 pr-4 text-xs">{fmtTokens(s.totalGeneratedTokens)}</td>
                        <td className="num py-2.5 pr-4 text-xs">
                          {s.humanReviewRate == null ? (
                            <span style={{ color: 'var(--muted)' }}>{NA}</span>
                          ) : (
                            `${fmtPct(s.humanReviewRate, 1)} (${s.humanReviewCount})`
                          )}
                        </td>
                        <td className="num py-2.5 pr-4 text-xs">
                          {s.lowConfidenceCases == null ? (
                            <span style={{ color: 'var(--muted)' }}>{NA}</span>
                          ) : (
                            s.lowConfidenceCases
                          )}
                        </td>
                        <td className="num py-2.5 pr-4 text-xs">{s.parseFailures}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed" style={{ color: 'var(--muted)' }}>
              “Low confidence” counts decisions whose top probability was under 0.50. Methods with no
              per-choice probability show {NA} for the confidence-derived columns — that is a property of the
              method, not a measurement failure.
            </p>
          </Card>

          <Card
            title="Accuracy by difficulty"
            subtitle="The dataset is weighted toward hard cases on purpose. The spread between columns is where these methods get interesting."
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <th scope="col" className="label py-2.5 pr-4 text-left">
                      Method
                    </th>
                    {['easy', 'medium', 'hard'].map((d) => (
                      <th key={d} scope="col" className="label py-2.5 pr-4 text-left">
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {METHODS.filter((m) => summaries[m.key]).map((m) => (
                    <tr key={m.key} className="border-b" style={{ borderColor: 'var(--border)' }}>
                      <th scope="row" className="py-2.5 pr-4 text-left text-xs font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          <Dot color={m.color} />
                          {m.name}
                        </span>
                      </th>
                      {['easy', 'medium', 'hard'].map((d) => (
                        <td key={d} className="num py-2.5 pr-4 text-xs">
                          {fmtPct(summaries[m.key].accuracyByDifficulty[d], 1)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <MethodBarChart
              title="Accuracy by method"
              subtitle={`correct / ${tickets.length} tickets`}
              rows={chartRows((s) => ({ value: s.accuracy, label: fmtPct(s.accuracy, 1) }))}
              domain={[0, 1]}
              tickFormatter={(v) => `${Math.round(v * 100)}%`}
            />

            {!isDemo ? (
              <MethodBarChart
                title="Average latency by method"
                subtitle="milliseconds per decision, requests issued one at a time"
                tip="Wall-clock time around the HTTP call to the local server. The classifier runs in-process, so its latency is not comparable to a network round trip."
                rows={chartRows((s) => ({ value: s.avgLatencyMs, label: fmtMs(s.avgLatencyMs) }))}
              />
            ) : (
              <SuppressedChart title="Average latency by method">
                There is no model to measure, and showing the stand-in's sub-millisecond timings as a latency
                benchmark would be misleading.
              </SuppressedChart>
            )}

            {!isDemo ? (
              <MethodBarChart
                title="Generated tokens by method"
                subtitle="average tokens sampled per decision"
                tip="Jev-style reports 0 because it samples nothing - it reads logits from a single forward pass. The classifier generates no tokens either."
                rows={chartRows((s) => ({
                  value: s.avgGeneratedTokens,
                  label: fmtNum(s.avgGeneratedTokens),
                }))}
              />
            ) : (
              <SuppressedChart title="Generated tokens by method">
                No tokens were generated by the stand-in, so there is nothing to count.
              </SuppressedChart>
            )}

            <MethodBarChart
              title="Human review rate by method"
              subtitle={`share of decisions below the policy thresholds (top ≥ ${thresholds.minTop.toFixed(2)}, margin ≥ ${thresholds.minMargin.toFixed(2)})`}
              tip="Only methods that produce a probability can be evaluated against the policy, so Normal LLM and Structured are N/A here."
              rows={chartRows((s) => ({
                value: s.humanReviewRate,
                label: fmtPct(s.humanReviewRate, 1),
              }))}
              domain={[0, 1]}
              tickFormatter={(v) => `${Math.round(v * 100)}%`}
            />
          </div>

          {jevRows.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,22rem)]">
              <ProbabilityChart
                probabilities={focus?.probabilities}
                subtitle={
                  focus
                    ? `${focus.ticket_id} · ground truth ${focus.ground_truth} · predicted ${focus.decision ?? '—'}`
                    : undefined
                }
              />
              <Card
                title="Closest call"
                subtitle="By default this shows the run's narrowest top-two margin — the case where a probability is most worth looking at."
              >
                <label htmlFor="focus" className="label mb-1.5 block">
                  Ticket
                </label>
                <select
                  id="focus"
                  className="field cursor-pointer"
                  value={focusTicket ?? focus?.ticket_id ?? ''}
                  onChange={(e) => setFocusTicket(e.target.value || null)}
                >
                  {jevRows.map((r) => (
                    <option key={r.ticket_id} value={r.ticket_id}>
                      {r.ticket_id} · {r.difficulty} · {r.correct ? '✓' : '✗'} {r.decision}
                    </option>
                  ))}
                </select>
                {focus && (
                  <div className="mt-3 space-y-2 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    <p className="italic">“{focus.text}”</p>
                    <p>
                      <strong style={{ color: 'var(--text-primary)' }}>
                        {focus.needs_human_review ? '⚑ Human review' : 'Auto-decide'}
                      </strong>{' '}
                      — {focus.review_reason}
                    </p>
                    {focus.ground_truth_reason && (
                      <p>
                        <span className="label">Ground truth rationale</span>
                        <br />
                        {focus.ground_truth_reason}
                      </p>
                    )}
                  </div>
                )}
              </Card>
            </div>
          )}

          <Card
            title="Run records"
            subtitle="Every decision in this run, as logged. This is the table view behind every chart above."
            right={
              <InfoTip label="About the records table">
                The backend appends the same rows to runs/decisions.jsonl so a run can be reproduced and
                re-analysed outside the UI.
              </InfoTip>
            }
          >
            <div className="max-h-[28rem] overflow-auto">
              <table className="w-full min-w-[760px] border-collapse text-xs">
                <thead className="sticky top-0" style={{ background: 'var(--surface-1)' }}>
                  <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                    {['Ticket', 'Difficulty', 'Method', 'Ground truth', 'Prediction', 'Result', 'Latency', 'Tokens', 'Confidence', 'Review'].map(
                      (h) => (
                        <th key={h} scope="col" className="label py-2 pr-4 text-left">
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {records.map((r, i) => (
                    <tr key={`${r.ticket_id}-${r.method}-${i}`} className="border-b" style={{ borderColor: 'var(--border)' }}>
                      <td className="num py-1.5 pr-4">{r.ticket_id}</td>
                      <td className="py-1.5 pr-4">{r.difficulty}</td>
                      <td className="py-1.5 pr-4">
                        <span className="inline-flex items-center gap-1.5">
                          <Dot color={METHOD_BY_KEY[r.method].color} />
                          {METHOD_BY_KEY[r.method].name}
                        </span>
                      </td>
                      <td className="py-1.5 pr-4">{r.ground_truth}</td>
                      <td className="py-1.5 pr-4">{r.decision ?? '—'}</td>
                      <td
                        className="py-1.5 pr-4 font-medium"
                        style={{ color: r.correct ? 'var(--status-good)' : 'var(--status-critical)' }}
                      >
                        {r.correct ? '✓' : '✗'}
                      </td>
                      <td className="num py-1.5 pr-4">{fmtMs(r.latency_ms)}</td>
                      <td className="num py-1.5 pr-4">{fmtTokens(r.generated_tokens)}</td>
                      <td className="num py-1.5 pr-4">
                        {r.confidence == null ? <span style={{ color: 'var(--muted)' }}>{NA}</span> : fmtPct(r.confidence, 1)}
                      </td>
                      <td className="py-1.5 pr-4">
                        {r.needs_human_review == null ? (
                          <span style={{ color: 'var(--muted)' }}>{NA}</span>
                        ) : r.needs_human_review ? (
                          <span style={{ color: 'var(--status-warning)' }}>⚑</span>
                        ) : (
                          'auto'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
