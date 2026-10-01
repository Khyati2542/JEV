import { useCallback, useEffect, useState } from 'react'
import api from './api/client'
import Header from './components/Header'
import DecidePage from './pages/DecidePage'
import BenchmarkPage from './pages/BenchmarkPage'
import ExplainPage from './pages/ExplainPage'

function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('db-theme') || 'dark')
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem('db-theme', theme)
    } catch {
      /* private browsing - the attribute above is all that matters */
    }
  }, [theme])
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))]
}

export default function App() {
  const [tab, setTab] = useState('decide')
  const [health, setHealth] = useState(null)
  const [thresholds, setThresholds] = useState({ minTop: 0.8, minMargin: 0.2 })
  const [theme, toggleTheme] = useTheme()

  const refreshHealth = useCallback(async () => {
    try {
      const h = await api.health()
      setHealth(h)
      setThresholds((t) =>
        t.touched ? t : { minTop: h.thresholds.min_top, minMargin: h.thresholds.min_margin },
      )
    } catch {
      setHealth(null)
    }
  }, [])

  useEffect(() => {
    refreshHealth()
    const id = setInterval(refreshHealth, 30000)
    return () => clearInterval(id)
  }, [refreshHealth])

  const onThresholds = (next) => setThresholds({ ...next, touched: true })

  return (
    <div className="min-h-full">
      <Header tab={tab} onTab={setTab} health={health} theme={theme} onTheme={toggleTheme} />

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
        {tab === 'decide' && (
          <DecidePage health={health} thresholds={thresholds} onThresholds={onThresholds} />
        )}
        {tab === 'benchmark' && <BenchmarkPage health={health} thresholds={thresholds} />}
        {tab === 'explain' && <ExplainPage health={health} />}
      </main>

      <footer
        className="border-t px-4 py-5 text-center text-[11px] sm:px-6"
        style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
      >
        DecisionBench — a Jev-style fixed-choice scoring mechanism built from open-source components. It does
        not reproduce TypeSafe's proprietary Jev model, weights, training process, or evaluation system.
      </footer>
    </div>
  )
}
