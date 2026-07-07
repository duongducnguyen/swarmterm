import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface DialogTarget {
  leafId: string
  branch: string
  uncommittedCount: number
  unmergedCount: number
  dirty: boolean
}

interface ClearWorktreeDialogProps {
  open: boolean
  targets: DialogTarget[]
  onConfirm: (approvedLeafIds: string[]) => void
  onClose: () => void
}

function reason(t: DialogTarget): string {
  const parts: string[] = []
  if (t.uncommittedCount > 0) parts.push(`${t.uncommittedCount} uncommitted file${t.uncommittedCount > 1 ? 's' : ''}`)
  if (t.unmergedCount > 0) parts.push(`${t.unmergedCount} unmerged commit${t.unmergedCount > 1 ? 's' : ''}`)
  return parts.join(', ')
}

export function ClearWorktreeDialog({
  open,
  targets,
  onConfirm,
  onClose,
}: ClearWorktreeDialogProps): React.ReactElement | null {
  const clean = targets.filter((t) => !t.dirty)
  const dirty = targets.filter((t) => t.dirty)

  // Dirty worktrees are protected: unchecked by default, the user opts each in.
  const [checked, setChecked] = useState<Set<string>>(new Set())
  // Reset the opt-in set every time the dialog re-opens for a new target set.
  useEffect(() => {
    if (open) setChecked(new Set())
  }, [open, targets])

  if (!open) return null

  const approved = [...clean.map((t) => t.leafId), ...[...checked]]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={onClose}
    >
      <div
        className="w-[28rem] max-w-[90vw] rounded-md border border-border bg-card p-4 text-sm shadow-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="mb-2 text-base font-medium text-foreground">Clear worktree</h2>

        {clean.length > 0 && (
          <p className="mb-3 text-muted-foreground">
            {clean.length} worktree{clean.length > 1 ? 's' : ''} will be removed (directory and
            branch).
          </p>
        )}

        {dirty.length > 0 && (
          <div className="mb-3">
            <div className="mb-1 flex items-center gap-1.5 text-foreground">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span>These have unsaved work — tick to remove anyway:</span>
            </div>
            <ul className="space-y-1">
              {dirty.map((t) => (
                <li key={t.leafId} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked.has(t.leafId)}
                    onChange={(e) =>
                      setChecked((prev) => {
                        const next = new Set(prev)
                        if (e.target.checked) next.add(t.leafId)
                        else next.delete(t.leafId)
                        return next
                      })
                    }
                  />
                  <span className="truncate font-mono text-xs">{t.branch}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{reason(t)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={approved.length === 0}
            onClick={() => onConfirm(approved)}
          >
            Clear {approved.length > 1 ? `${approved.length} worktrees` : 'worktree'}
          </Button>
        </div>
      </div>
    </div>
  )
}
