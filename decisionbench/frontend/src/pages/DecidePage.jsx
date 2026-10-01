import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import api from '../api/client'
import { DIFFICULTY_STYLE, METHODS, METHOD_KEYS } from '../lib/methods'
import ComparisonTable from '../components/ComparisonTable'
import DecisionSpace from '../components/DecisionSpace'
import JevExplainer from '../components/JevExplainer'
import ResultCard from '../components/ResultCard'
import ThresholdPolicy from '../components/ThresholdPolicy'
import { Card, Notice, Spinner } from '../components/Primitives'

function DifficultyBadge({ difficulty }) {
  const s = DIFFICULTY_STYLE[difficulty]
  if (!s) return null
  return (
    <span className="chip" style={{ borderColor: s.fg }}>
      <span className="label" style={{ color: 'var(--muted)' }}>
        Difficulty
      </span>
      <span className="font-bold tracking-wide" style={{ color: s.fg }}>
        {s.text}
      </span>
    </span>
  )
}

export default function DecidePage({ health, thresholds, onThresholds }) {
  const [tickets, setTickets] = useState([])
  const [text, setText] = useState('')
  const [ticket, setTicket] = useState(null)
  const [results, setResults] = useState({})
  const [running, setRunning] = useState({})
  const [errors, setErrors] = useState({})
  const [fatal, setFatal] = useState(null)
  const liveRegion = useRef(null)

  useEffect(() => {
    api
      .tickets()
      .then(setTickets)
      .catch((e) => setFatal(e.message))
  }, [])

  const busy = Object.values(running).some(Boolean)
  const hasResults = METHOD_KEYS.some((k) => results[k])

  const reset = useCallback(() => {
    setResults({})
    setErrors({})
  }, [])

  const onTextChange = (value) => {
    setText(value)
    // Editing the text detaches it from the dataset row, so ground truth no
    // longer applies and stale results must not linger.
    setTicket(null)
    reset()
  }

  const loadTicket = (row) => {
    if (!row) return
    setText(row.text)
    setTicket({ id: row.id, difficulty: row.difficulty })
    reset()
  }

  const randomHard = async () => {
    try {
      loadTicket(await api.randomTicket('hard'))
    } catch (e) {
      setFatal(e.message)
    }
  }

  const run = useCallback(
    async (methods) => {
      if (!text.trim()) return
      setErrors({})
      setRunning(Object.fromEntries(methods.map((m) => [m, true])))

      const payload = {
        min_top: thresholds.minTop,
        min_margin: thresholds.minMargin,
        ...(ticket ? { ticket_id: ticket.id } : { text }),
      }

      // Sequential on purpose: concurrent requests to one local model server
      // would contend and make the latency numbers meaningless.
      for (const method of methods) {
        try {
          const res = await api.decide(method, payload)
          setResults((prev) => ({ ...prev, [method]: res }))
        } catch (e) {
          setErrors((prev) => ({ ...prev, [method]: e.message }))
        } finally {
          setRunning((prev) => ({ ...prev, [method]: false }))
        }
      }
      if (liveRegion.current) liveRegion.current.textContent = 'Run complete.'
    },
    [text, ticket, thresholds],
  )

  const groundTruth = useMemo(
    () => METHOD_KEYS.map((k) => results[k]?.ground_truth).find(Boolean) ?? null,
    [results],
  )

  return (
    <div className="space-y-5">
      {fatal && (
        <Notice tone="critical" title="API unavailable.">
          {fatal}
        </Notice>
      )}

      {health?.mode === 'demo' && (
        <Notice tone="warning" title="DEMO MODE — local model unavailable.">
          No model server answered at <code>{health.gen_base_url}</code>. Every value below the Classifier row
          is produced by a deterministic local stand-in so the interface stays usable. These are{' '}
          <strong>not</strong> model measurements and must not be read as a benchmark. Start SGLang (see the
          README) and reload for live numbers.
        </Notice>
      )}

      <Card
        title="Support Request"
        subtitle="The application already knows the five answers it will accept. The only question is which one."
        right={
          <div className="flex flex-wrap items-center gap-2">
            {ticket && <DifficultyBadge difficulty={ticket.difficulty} />}
            {ticket && (
              <span className="chip num" title="Dataset ticket id">
                {ticket.id}
              </span>
            )}
          </div>
        }
      >
        <label htmlFor="request" className="sr-only">
          Support request text
        </label>
        <textarea
          id="request"
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          rows={6}
          spellCheck={false}
          placeholder="Paste a support request, or load one of the 54 labelled scenarios below…"
          className="field resize-y font-normal leading-relaxed"
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={randomHard} className="btn" disabled={busy}>
            Random Hard Case
          </button>

          <label htmlFor="example" className="sr-only">
            Load an example from the dataset
          </label>
          <select
            id="example"
            className="field w-auto max-w-[22rem] cursor-pointer py-2"
            value={ticket?.id ?? ''}
            disabled={busy || tickets.length === 0}
            onChange={(e) => loadTicket(tickets.find((t) => t.id === e.target.value))}
          >
            <option value="">Load Example…</option>
            {tickets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.id} · {t.difficulty.toUpperCase()} · {t.text.slice(0, 60)}
                {t.text.length > 60 ? '…' : ''}
              </option>
            ))}
          </select>

          {text && (
            <button
              type="button"
              onClick={() => {
                setText('')
                setTicket(null)
                reset()
              }}
              className="btn"
              disabled={busy}
            >
              Clear
            </button>
          )}
        </div>

        <hr className="my-4" style={{ borderColor: 'var(--border)' }} />

        <DecisionSpace highlight={groundTruth && hasResults ? groundTruth : null} />

        <div className="mt-4 flex flex-wrap gap-2">
          {METHODS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => run([m.key])}
              className="btn"
              disabled={busy || !text.trim()}
            >
              {running[m.key] && <Spinner />}
              Run {m.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => run(METHOD_KEYS)}
            className="btn btn-primary"
            disabled={busy || !text.trim()}
          >
            {busy && <Spinner />}
            Run All
          </button>
        </div>

        {ticket && !hasResults && (
          <p className="mt-3 text-[11px]" style={{ color: 'var(--muted)' }}>
            Ground truth is hidden until a method has run.
          </p>
        )}
        <p ref={liveRegion} role="status" aria-live="polite" className="sr-only" />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {METHODS.map((m) => (
          <ResultCard
            key={m.key}
            methodKey={m.key}
            result={results[m.key]}
            running={!!running[m.key]}
            error={errors[m.key]}
          />
        ))}
      </div>

      {hasResults && (
        <Card
          title="Method Comparison"
          subtitle="Methods are listed in a fixed order and are never ranked. The point is to inspect the tradeoffs, not to pick a winner."
        >
          <ComparisonTable results={results} />
        </Card>
      )}

      <Card
        title="Human-review policy"
        subtitle="Decide when a probability is strong enough to act on without a person."
      >
        <ThresholdPolicy thresholds={thresholds} onChange={onThresholds} />
      </Card>

      <JevExplainer />
    </div>
  )
}
