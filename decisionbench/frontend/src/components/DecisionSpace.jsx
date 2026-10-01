import { CATEGORIES, CATEGORY_TO_LABEL } from '../lib/methods'
import { InfoTip } from './Primitives'

const OTHER_TOOLTIP =
  'Without an Other/Escalate option, restricted scoring is forced to distribute probability ' +
  'among the available categories even when none is appropriate.'

export default function DecisionSpace({ highlight }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="label">Decision Space</span>
        <span className="text-[11px]" style={{ color: 'var(--muted)' }}>
          known before inference runs
        </span>
      </div>
      <ul className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => {
          const on = highlight === cat
          return (
            <li key={cat}>
              <span
                className="chip"
                style={
                  on
                    ? { borderColor: 'var(--accent)', color: 'var(--text-primary)', background: 'var(--surface-2)' }
                    : undefined
                }
              >
                <span className="num text-[10px] font-bold" style={{ color: 'var(--muted)' }}>
                  {CATEGORY_TO_LABEL[cat]}
                </span>
                {cat}
                {cat === 'Other' && <InfoTip label="Why Other matters">{OTHER_TOOLTIP}</InfoTip>}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
