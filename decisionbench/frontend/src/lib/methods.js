/**
 * Method metadata.
 *
 * `order` is the ONLY order these are ever rendered in - cards, table columns
 * and every chart. Nothing in this dashboard sorts methods by their measured
 * values, because this benchmark does not rank methods or declare a winner.
 *
 * Colour identifies the method, in validated palette-slot order, so screen
 * adjacency matches the pair list the palette was checked against.
 */
export const METHODS = [
  {
    key: 'normal',
    name: 'Normal LLM',
    color: 'var(--series-1)',
    hex: { light: '#2a78d6', dark: '#3987e5' },
    summary: 'Writes a JSON answer token by token, then we parse it.',
  },
  {
    key: 'structured',
    name: 'Structured',
    color: 'var(--series-2)',
    hex: { light: '#eb6834', dark: '#d95926' },
    summary: 'Same prompt, but the sampler is constrained to the 5-category schema.',
  },
  {
    key: 'jev',
    name: 'Jev-style',
    color: 'var(--series-3)',
    hex: { light: '#1baf7a', dark: '#199e70' },
    summary: 'Generates nothing. Scores the five known labels in one forward pass.',
  },
  {
    key: 'classifier',
    name: 'Classifier',
    color: 'var(--series-4)',
    hex: { light: '#eda100', dark: '#c98500' },
    summary: 'Local baseline for reference. Not a tuned production classifier.',
  },
]

export const METHOD_KEYS = METHODS.map((m) => m.key)
export const METHOD_BY_KEY = Object.fromEntries(METHODS.map((m) => [m.key, m]))

export const CATEGORIES = ['Billing', 'Technical', 'Account', 'Security', 'Other']
export const LABEL_MAP = { A: 'Billing', B: 'Technical', C: 'Account', D: 'Security', E: 'Other' }
export const CATEGORY_TO_LABEL = Object.fromEntries(
  Object.entries(LABEL_MAP).map(([l, c]) => [c, l]),
)

export const DIFFICULTY_STYLE = {
  easy: { fg: 'var(--status-good)', text: 'EASY' },
  medium: { fg: 'var(--status-warning)', text: 'MEDIUM' },
  hard: { fg: 'var(--status-critical)', text: 'HARD' },
}

/** Values that genuinely could not be measured render as "N/A" - never as 0. */
export const NA = 'N/A'

export const fmtMs = (v) =>
  v === null || v === undefined ? NA : v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${v.toFixed(1)} ms`

export const fmtTokens = (v) => (v === null || v === undefined ? NA : String(v))

export const fmtPct = (v, digits = 0) =>
  v === null || v === undefined ? NA : `${(v * 100).toFixed(digits)}%`

export const fmtNum = (v, digits = 1) =>
  v === null || v === undefined ? NA : Number(v).toFixed(digits)
