import GenerateVsScore from '../components/GenerateVsScore'
import JevExplainer from '../components/JevExplainer'
import { Card, Notice } from '../components/Primitives'
import { METHODS } from '../lib/methods'
import { Dot } from '../components/Primitives'

export default function ExplainPage({ health }) {
  return (
    <div className="space-y-5">
      <Card
        title="When an application already knows the possible answers, why generate text just to choose one?"
        subtitle="That is the whole question this project exists to make concrete."
      >
        <div className="space-y-3 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          <p>
            A support request arrives. It can be exactly one of five things: Billing, Technical, Account,
            Security or Other. The set of valid answers was fixed before the request existed — it is part of
            the application, not something the model gets to invent.
          </p>
          <p>
            A normal LLM call ignores that. It is asked to <em>write</em> the answer: open brace, quote, the
            word <code>category</code>, quote, colon, and so on, one forward pass per token, until it emits a
            stop token. Then our code parses the string back into one of five values we already had. The model
            spent tokens reconstructing a fact the application never lost.
          </p>
          <p>
            Fixed-choice scoring removes that round trip. One forward pass, read the logits where the answer
            would have begun, keep the five tokens that stand for the choices, and normalise across just those
            five. The output is a distribution over the decision space instead of a sentence.
          </p>
        </div>
      </Card>

      <Card title="Generation vs scoring" subtitle="The same decision, two mechanisms.">
        <GenerateVsScore />
      </Card>

      <JevExplainer defaultOpen />

      <Card title="The four methods in this benchmark">
        <ul className="space-y-3">
          {METHODS.map((m) => (
            <li key={m.key} className="flex gap-3">
              <span className="mt-1.5">
                <Dot color={m.color} />
              </span>
              <div>
                <h4 className="text-sm font-semibold">{m.name}</h4>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {m.summary}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4 space-y-3">
          <Notice tone="info" title="The classifier is a reference point, not a contender.">
            It is trained on this project's own 54-row dataset, which is far too small for a production
            classifier. Benchmark predictions are made out of fold, so no ticket is ever scored by a model
            that trained on it — but the headline comparison here is Normal LLM vs Jev-style scoring.
          </Notice>
          <Notice tone="warning" title="What this project is not.">
            This project implements a Jev-style fixed-choice scoring mechanism using open-source components.
            It does not reproduce TypeSafe's proprietary Jev model, weights, training process, or evaluation
            system. Everything here runs locally on open weights at zero cost.
          </Notice>
        </div>
      </Card>

      <Card title="Limitations worth keeping in view">
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          <li>
            <strong style={{ color: 'var(--text-primary)' }}>The probabilities are relative.</strong> They are
            normalised across five labels the model was handed. A confident-looking 0.91 says the model
            prefers that label over the four alternatives, not that it is right 91% of the time.
          </li>
          <li>
            <strong style={{ color: 'var(--text-primary)' }}>54 tickets is a small sample.</strong> A few
            percentage points of accuracy difference between methods is noise at this size. Treat the dataset
            as a probe for behaviour, not as a leaderboard.
          </li>
          <li>
            <strong style={{ color: 'var(--text-primary)' }}>Labels are one annotator's judgement.</strong>{' '}
            Several hard tickets are genuinely arguable — that is the point of including them, but it means
            "incorrect" sometimes means "defensibly different".
          </li>
          <li>
            <strong style={{ color: 'var(--text-primary)' }}>Prompts cannot be perfectly identical.</strong>{' '}
            Normal and Structured share a byte-identical prompt. Jev-style must end with "return only the
            label" rather than "reply with JSON", because that instruction is the mechanism under test.
          </li>
          <li>
            <strong style={{ color: 'var(--text-primary)' }}>Latency is environment-bound.</strong> It depends
            on your GPU or CPU, the server's batching and KV cache state. Compare methods within one run, not
            across machines.
          </li>
          <li>
            <strong style={{ color: 'var(--text-primary)' }}>Scoring needs single-token labels.</strong> A/B/C/D/E
            each tokenise to one token for Qwen. A decision space whose labels need several tokens cannot be
            scored in one forward pass this way.
          </li>
        </ul>
      </Card>

      {health && (
        <Card title="Current configuration" subtitle="What this instance is actually talking to.">
          <dl className="grid gap-x-8 gap-y-2 text-xs sm:grid-cols-2">
            {[
              ['Mode', health.mode === 'live' ? 'LIVE LOCAL MODEL' : 'DEMO (no model server)'],
              ['Model', health.model],
              ['Generation endpoint', health.gen_base_url],
              ['Scoring endpoint', health.score_base_url],
              ['Server reachable', String(health.server_reachable)],
              ['/v1/score', health.score_endpoint],
              ['Tokenizer', health.tokenizer],
              ['Classifier backend', health.classifier_backend],
              ['Dataset', `${health.dataset.total} tickets`],
              ['Thresholds', `top ≥ ${health.thresholds.min_top}, margin ≥ ${health.thresholds.min_margin}`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b py-1.5" style={{ borderColor: 'var(--border)' }}>
                <dt style={{ color: 'var(--text-secondary)' }}>{k}</dt>
                <dd className="num text-right font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          {health.detail && (
            <p className="mt-3 text-[11px]" style={{ color: 'var(--muted)' }}>
              {health.detail}
            </p>
          )}
        </Card>
      )}
    </div>
  )
}
