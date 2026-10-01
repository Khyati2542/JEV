import { Notice } from './Primitives'

function Slider({ id, label, value, onChange, hint }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium">
          {label}
        </label>
        <span className="num text-xs font-semibold">{value.toFixed(2)}</span>
      </div>
      <input
        id={id}
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 w-full accent-[var(--accent)]"
      />
      <p className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--muted)' }}>
        {hint}
      </p>
    </div>
  )
}

export default function ThresholdPolicy({ thresholds, onChange }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Slider
          id="min-top"
          label="Minimum top probability"
          value={thresholds.minTop}
          onChange={(v) => onChange({ ...thresholds, minTop: v })}
          hint="The winning choice must reach at least this probability."
        />
        <Slider
          id="min-margin"
          label="Minimum margin over 2nd"
          value={thresholds.minMargin}
          onChange={(v) => onChange({ ...thresholds, minMargin: v })}
          hint="The gap between 1st and 2nd place must be at least this wide."
        />
      </div>

      <div
        className="rounded-md border p-3 font-mono text-[11px] leading-relaxed"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text-secondary)' }}
      >
        AUTO DECIDE if top &gt;= {thresholds.minTop.toFixed(2)} AND (top − second) &gt;={' '}
        {thresholds.minMargin.toFixed(2)}
        <br />
        otherwise HUMAN REVIEW
      </div>

      <Notice tone="info" title="Policy, not a model property.">
        These thresholds are application-level policies, not requirements of Jev. They are a decision your
        application makes about how much relative confidence it wants before acting without a person. Methods
        that produce no probability at all cannot be evaluated against them, which is why Normal LLM and
        Structured show N/A.
      </Notice>
    </div>
  )
}
