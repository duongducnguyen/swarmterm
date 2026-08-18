import type { ReactElement } from 'react'
import { AgentIcon } from '@/components/AgentIcon'
import { manifestForAgent } from '@/lib/agent-state/manifests'
import { agentNotificationsEnabled } from '@/lib/notification-pref'
import { TEMPLATES } from '@/lib/templates'
import { cn } from '@/lib/utils'
import { useNotificationPrefStore } from '@/store/notification-pref-store'

interface ToggleRowProps {
  label: string
  description?: string
  checked: boolean
  onChange: (on: boolean) => void
  icon?: ReactElement
}

function ToggleRow({ label, description, checked, onChange, icon }: ToggleRowProps): ReactElement {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="flex min-w-0 items-center gap-2">
        {icon}
        <div className="min-w-0">
          <div className="text-sm text-foreground">{label}</div>
          {description && <div className="text-xs text-muted-foreground">{description}</div>}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-muted'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0.5'
          )}
        />
      </button>
    </div>
  )
}

/** Agent templates that actually have a state detector — plain shells never notify. */
const AGENT_TEMPLATES = TEMPLATES.filter((t) => manifestForAgent(t.id) !== undefined)

export function NotificationsPanel(): ReactElement {
  const prefs = useNotificationPrefStore((s) => s.prefs)
  const { setSound, setSystem, setAgentEnabled } = useNotificationPrefStore.getState()

  return (
    <div className="space-y-8">
      <section>
        <h3 className="mb-1 text-base font-semibold text-foreground">Notifications</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          When a background agent pane needs your input or finishes, Swarmterm plays a short
          chime — and shows a system notification if the window is unfocused.
        </p>
        <ToggleRow label="Sound" description="Chime when a background agent blocks or finishes." checked={prefs.sound} onChange={setSound} />
        <ToggleRow label="System notifications" description="Only shown while the Swarmterm window is unfocused." checked={prefs.system} onChange={setSystem} />
      </section>

      <section>
        <h3 className="mb-1 text-sm font-semibold text-foreground">Per agent</h3>
        <p className="mb-2 text-xs text-muted-foreground">Turn off both channels for a specific agent.</p>
        {AGENT_TEMPLATES.map((t) => (
          <ToggleRow
            key={t.id}
            label={t.name}
            checked={agentNotificationsEnabled(prefs, t.id)}
            onChange={(on) => setAgentEnabled(t.id, on)}
            icon={<AgentIcon template={t} className="h-4 w-4" />}
          />
        ))}
      </section>
    </div>
  )
}
