import { Flow } from './Flow'
import { METHOD_BY_KEY } from '../lib/methods'
import { Dot } from './Primitives'

const NORMAL = [
  { text: 'PROMPT' },
  { text: 'GENERATE TOKEN', note: '{' },
  { text: 'GENERATE TOKEN', note: '"category"' },
  { text: 'GENERATE TOKEN', note: ':' },
  { text: '…', tone: 'repeat', note: 'one forward pass per token, until a stop token' },
  { text: 'JSON' },
  { text: 'PARSE', note: 'can fail' },
  { text: 'DECISION', tone: 'result' },
]

const JEV = [
  { text: 'PROMPT' },
  { text: 'MODEL', note: 'one forward pass' },
  { text: 'LOGITS' },
  { text: 'A / B / C / D / E', tone: 'accent' },
  { text: 'SOFTMAX' },
  { text: 'DECISION', tone: 'result' },
]

function Panel({ title, caption, color, steps, label }) {
  return (
    <div className="card p-4 sm:p-5">
      <header className="mb-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Dot color={color} />
          {title}
        </h3>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {caption}
        </p>
      </header>
      <Flow steps={steps} label={label} />
    </div>
  )
}

export default function GenerateVsScore() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel
        title="Normal generation"
        caption="The answer is written out one token at a time, then read back by our code."
        color={METHOD_BY_KEY.normal.color}
        steps={NORMAL}
        label="Normal generation pipeline"
      />
      <Panel
        title="Jev-style scoring"
        caption="The answer already exists in the decision space. The model only has to score it."
        color={METHOD_BY_KEY.jev.color}
        steps={JEV}
        label="Jev-style scoring pipeline"
      />
    </div>
  )
}
