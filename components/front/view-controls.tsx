"use client"

import type { DirectiveView, PageView } from "@/lib/view/model"
import type { SettingChip } from "@/components/brief/setting-chips"

/**
 * The reader's saved changes, visible and removable: one chip per rule with what it
 * hid, and Reset. Shown at the top of the "Change what you see" panel.
 */
export function ViewControls({
  view,
  settings,
  onRemoveRule,
  onClearSetting,
  onReset,
}: {
  view: PageView
  settings: SettingChip[]
  onRemoveRule: (id: string) => void
  onClearSetting: (id: string) => void
  onReset: () => void
}) {
  if (view.isDefault && view.directives.length === 0 && settings.length === 0) return null
  return (
    <div className="vc" aria-label="Your view">
      <div className="vc__head">
        <span className="eyebrow">Your view</span>
        <button type="button" className="linkbtn" onClick={onReset}>
          Reset to default
        </button>
      </div>
      <div className="vc__chips">
        {view.directives.map((d) => (
          <Chip key={d.id} label={d.summary} meta={directiveMeta(d)} off={d.state !== "active"} onRemove={() => onRemoveRule(d.id)} />
        ))}
        {settings.map((c) => (
          <Chip key={c.id} label={c.label} meta={null} off={false} onRemove={() => onClearSetting(c.id)} />
        ))}
        {view.directives.length === 0 && settings.length === 0 ? <span className="chip">View changed</span> : null}
      </div>
      {view.hiddenTotal > 0 ? (
        <p className="vc__note">
          {view.hiddenTotal} {view.hiddenTotal === 1 ? "item is" : "items are"} hidden by your view.
        </p>
      ) : null}
      {view.settingsNote ? <p className="vc__note vc__note--warn">{view.settingsNote}</p> : null}
    </div>
  )
}

function directiveMeta(d: DirectiveView): string | null {
  if (d.state === "expired") return "last week"
  if (d.state === "inactive") return "not this week"
  if (d.kind === "filter" && d.hidden > 0) return `${d.hidden} hidden`
  return null
}

function Chip({ label, meta, off, onRemove }: { label: string; meta: string | null; off: boolean; onRemove: () => void }) {
  return (
    <span className={off ? "chip is-off" : "chip"}>
      {label}
      {meta ? <span className="chip__meta">{meta}</span> : null}
      <button type="button" className="chip__x" aria-label={`Remove ${label}`} onClick={onRemove}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 2l6 6M8 2 2 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
    </span>
  )
}
