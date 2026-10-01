import { useState } from 'react'
import { Flow } from './Flow'
import { Notice } from './Primitives'
import { LABEL_MAP } from '../lib/methods'

const PIPELINE = [
  { text: 'USER REQUEST' },
  { text: 'PROMPT', note: 'the same ticket text and the same five choices every method sees' },
  { text: 'TOKENIZER' },
  { text: 'QWEN', tone: 'accent', note: 'one forward pass — no sampling loop' },
  { text: 'NEXT TOKEN LOGITS', note: 'a score for every token in the vocabulary' },
  { text: 'SELECT A / B / C / D / E', tone: 'accent', note: 'keep only the five single-token labels' },
  { text: 'RESTRICTED SOFTMAX', note: 'normalise across those five values only' },
  { text: 'PROBABILITIES' },
  { text: 'DECISION', tone: 'result' },
]

export default function JevExplainer({ defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-4 text-left sm:p-5"
      >
        <span>
          <span className="block text-sm font-semibold">How Jev-style scoring works</span>
          <span className="mt-0.5 block text-xs" style={{ color: 'var(--text-secondary)' }}>
            From the request to the decision, without generating an answer.
          </span>
        </span>
        <span aria-hidden="true" style={{ color: 'var(--muted)' }}>
          {open ? '▴' : '▾'}
        </span>
      </button>

      {open && (
        <div className="grid gap-6 border-t p-4 sm:p-5 lg:grid-cols-[minmax(0,18rem)_1fr]" style={{ borderColor: 'var(--border)' }}>
          <Flow steps={PIPELINE} label="Jev-style scoring pipeline" />

          <div className="space-y-4 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            <p>
              <strong style={{ color: 'var(--text-primary)' }}>
                Normal generation asks the model to generate an answer. Jev-style scoring asks the model to
                score a predefined set of possible answers.
              </strong>
            </p>

            <p>
              A language model does not actually produce words. At each position it produces a{' '}
              <em>logit</em> for every token in its vocabulary — a raw, unnormalised score. Generation then
              samples one of those tokens, appends it, and runs the model again, repeating until it emits a
              stop token. That loop is what costs time.
            </p>

            <p>
              When the set of valid answers is already known, that loop is unnecessary work. We arrange the
              prompt so the answer would begin at exactly one position, read the logits there, and keep only
              the five tokens that stand for our choices:
            </p>

            <ul className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
              {Object.entries(LABEL_MAP).map(([label, cat]) => (
                <li key={label} className="num text-xs">
                  <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
                    {label}
                  </span>
                  <span className="mx-1.5" aria-hidden="true">
                    →
                  </span>
                  {cat}
                </li>
              ))}
            </ul>

            <p>
              A softmax over <em>only those five logits</em> — a restricted softmax — turns them into a
              distribution that sums to 1. Single-token labels matter here: if a label needed two tokens, one
              forward pass would not be enough to score it.
            </p>

            <p>
              The result is a distribution over the decision space rather than a sentence that has to be
              parsed. There is nothing to parse, so parsing cannot fail, and an answer outside the five
              categories is not representable.
            </p>

            <Notice tone="warning" title="Read these numbers carefully.">
              These probabilities are relative probabilities across the declared choices. They should not
              automatically be interpreted as calibrated real-world probabilities. A 0.91 means the model
              prefers that label nine-to-one over the alternatives <em>it was offered</em> — not that it is
              right 91% of the time.
            </Notice>

            <Notice tone="info" title="Scope.">
              This project implements a Jev-style fixed-choice scoring mechanism using open-source components.
              It does not reproduce TypeSafe's proprietary Jev model, weights, training process, or evaluation
              system.
            </Notice>
          </div>
        </div>
      )}
    </section>
  )
}
