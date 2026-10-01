import { Fragment } from 'react'

/** Minimal vertical flow diagram primitives shared by the explainer panels. */

export function Step({ children, tone = 'default', note, index }) {
  const tones = {
    default: { bg: 'var(--surface-2)', fg: 'var(--text-primary)', border: 'var(--border)' },
    accent: { bg: 'var(--surface-2)', fg: 'var(--text-primary)', border: 'var(--accent)' },
    result: { bg: 'var(--surface-2)', fg: 'var(--text-primary)', border: 'var(--status-good)' },
    repeat: { bg: 'transparent', fg: 'var(--text-secondary)', border: 'var(--baseline)' },
  }
  const t = tones[tone] || tones.default
  return (
    <li className="w-full">
      <div
        className="rounded-md border px-3 py-2 text-center text-[11px] font-semibold tracking-wide"
        style={{
          background: t.bg,
          color: t.fg,
          borderColor: t.border,
          borderStyle: tone === 'repeat' ? 'dashed' : 'solid',
        }}
      >
        {children}
      </div>
      {note && (
        <p className="mt-1 text-center text-[10px] leading-snug" style={{ color: 'var(--muted)' }}>
          {note}
        </p>
      )}
    </li>
  )
}

export function Arrow({ delay = 0, animate = true }) {
  return (
    <li aria-hidden="true" className="flex h-4 w-full items-center justify-center">
      <span
        className={animate ? 'flow-arrow' : undefined}
        style={{ color: 'var(--muted)', animationDelay: `${delay}ms`, fontSize: 12, lineHeight: 1 }}
      >
        ▼
      </span>
    </li>
  )
}

export function Flow({ steps, animate = true, label }) {
  return (
    <ol className="flex flex-col items-center" aria-label={label}>
      {steps.map((s, i) => (
        <Fragment key={`${s.text}-${i}`}>
          {i > 0 && <Arrow delay={i * 180} animate={animate} />}
          <Step tone={s.tone} note={s.note}>
            {s.text}
          </Step>
        </Fragment>
      ))}
    </ol>
  )
}
