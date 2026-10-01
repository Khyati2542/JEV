const BASE = import.meta.env.VITE_API_BASE || '/api'

async function request(path, options = {}) {
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
  } catch (err) {
    throw new Error(`Cannot reach the DecisionBench API at ${BASE}. Is the backend running?`)
  }
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch {
      /* keep the status line */
    }
    throw new Error(detail)
  }
  return res.json()
}

const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body ?? {}) })

export const api = {
  health: (refresh = false) => request(`/health${refresh ? '?refresh=true' : ''}`),
  tickets: () => request('/tickets'),
  randomTicket: (difficulty = 'hard') => request(`/tickets/random?difficulty=${difficulty}`),
  decide: (method, payload) => post(`/decision/${method}`, payload),
  benchmark: (payload) => post('/benchmark', payload),
}

export default api
