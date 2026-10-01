import { useState, useId } from 'react'

/** Small accessible info tooltip. Content is also readable via the title attr. */
export function InfoTip({ children, label = 'More information' }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        title={typeof children === 'string' ? children : undefined}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="grid h-4 w-4 place-items-center rounded-full border text-[10px] font-bold leading-none"
        style={{ borderColor: 'var(--baseline)', color: 'var(--muted)' }}
      >
        i
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-1/2 top-6 z-30 w-64 -translate-x-1/2 rounded-md border p-2.5 text-xs font-normal normal-case leading-relaxed shadow-lg"
          style={{
            background: 'var(--surface-1)',
            borderColor: 'var(--border)',
            color: 'var(--text-secondary)',
            letterSpacing: 0,
          }}
        >
          {children}
        </span>
      )}
    </span>
  )
}

export function Card({ title, subtitle, right, children, className = '' }) {
  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      {(title || right) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-semibold">{title}</h3>}
            {subtitle && (
              <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {subtitle}
              </p>
            )}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  )
}

export function Dot({ color }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ background: color }}
    />
  )
}

/** A non-dismissable, clearly-worded notice. `tone` never carries meaning alone. */
export function Notice({ tone = 'info', title, children }) {
  const tones = {
    info: { fg: 'var(--accent)', mark: 'i' },
    warning: { fg: 'var(--status-warning)', mark: '!' },
    critical: { fg: 'var(--status-critical)', mark: '!' },
  }
  const t = tones[tone] || tones.info
  return (
    <div
      className="flex gap-3 rounded-md border p-3 text-xs leading-relaxed"
      style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
      role={tone === 'info' ? undefined : 'status'}
    >
      <span
        aria-hidden="true"
        className="mt-px grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
        style={{ background: t.fg }}
      >
        {t.mark}
      </span>
      <div style={{ color: 'var(--text-secondary)' }}>
        {title && (
          <strong className="mr-1.5" style={{ color: 'var(--text-primary)' }}>
            {title}
          </strong>
        )}
        {children}
      </div>
    </div>
  )
}

export function Stat({ label, value, hint, accent }) {
  return (
    <div className="card p-3.5">
      <div className="label">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {hint && (
        <div className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--muted)' }}>
          {hint}
        </div>
      )}
    </div>
  )
}

export function Spinner({ className = '' }) {
  return (
    <svg
      className={`h-3.5 w-3.5 animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
