import { Dot, InfoTip } from './Primitives'

const TABS = [
  { key: 'decide', label: 'Decide' },
  { key: 'benchmark', label: 'Benchmark' },
  { key: 'explain', label: 'How it works' },
]

function ModeBadge({ health }) {
  const demo = !health || health.mode === 'demo'
  const color = demo ? 'var(--status-warning)' : 'var(--status-good)'
  const text = demo ? 'DEMO MODE' : 'LIVE LOCAL MODEL'
  const detail = demo
    ? `No local model server answered at ${health?.gen_base_url ?? 'the configured URL'}. Results are deterministic placeholders, not model measurements.`
    : `Serving ${health.model} from ${health.gen_base_url}.`
  return (
    <span className="chip" style={{ borderColor: color }}>
      <Dot color={color} />
      <span className="font-semibold tracking-wide" style={{ color: 'var(--text-primary)' }}>
        {text}
      </span>
      <InfoTip label="Inference mode">{detail}</InfoTip>
    </span>
  )
}

export default function Header({ tab, onTab, health, theme, onTheme }) {
  return (
    <header className="border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4 py-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-xl font-bold tracking-[0.14em]">DECISIONBENCH</h1>
              <span
                className="rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wide"
                style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}
              >
                Generate vs Decide
              </span>
            </div>
            <p className="mt-1.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Benchmarking different approaches for bounded AI decisions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="chip">
              <Dot color="var(--series-1)" /> Local
            </span>
            <span className="chip">
              <Dot color="var(--series-3)" /> Open Source
            </span>
            <span className="chip">
              <Dot color="var(--series-4)" /> ₹0
            </span>
            <ModeBadge health={health} />
            <button
              type="button"
              onClick={onTheme}
              className="btn px-2.5 py-1.5 text-xs"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            >
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
          </div>
        </div>

        <nav className="flex gap-1" aria-label="Sections">
          {TABS.map((t) => {
            const active = tab === t.key
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onTab(t.key)}
                aria-current={active ? 'page' : undefined}
                className="-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors"
                style={{
                  borderColor: active ? 'var(--accent)' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                {t.label}
              </button>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
