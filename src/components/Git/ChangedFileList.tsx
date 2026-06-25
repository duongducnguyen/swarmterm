// src/components/Git/ChangedFileList.tsx
import type { ReactElement } from 'react'
import { useGitStore, type ChangedFile } from '@/store/git-store'
import { InlineDiff } from './InlineDiff'

const STATUS_COLOR: Record<string, string> = {
  M: 'text-[#4ec994]',
  A: 'text-[#e2c08d]',
  D: 'text-[#f14c4c]',
  R: 'text-[#4ec994]',
  '?': 'text-muted-foreground',
}

function FileRow({ file }: { file: ChangedFile }): ReactElement {
  const expandedFiles = useGitStore((s) => s.expandedFiles)
  const fileDiffs = useGitStore((s) => s.fileDiffs)
  const toggleFileExpand = useGitStore((s) => s.toggleFileExpand)

  const isExpanded = expandedFiles.has(file.path)
  const diff = fileDiffs.get(file.path) ?? ''
  const basename = file.path.split('/').pop() ?? file.path

  return (
    <>
      <div
        className="flex cursor-pointer items-center gap-1.5 px-2 py-1 hover:bg-accent/50"
        title={file.path}
        onClick={() => toggleFileExpand(file.path)}
      >
        <span className="w-3 shrink-0 text-[10px] text-muted-foreground/60">
          {isExpanded ? '▼' : '▶'}
        </span>
        <span className={`w-3 shrink-0 text-[10px] font-bold ${STATUS_COLOR[file.status] ?? 'text-muted-foreground'}`}>
          {file.status}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-foreground">
          {basename}
        </span>
        {(file.added > 0 || file.removed > 0) && (
          <span className="shrink-0 text-[10px]">
            {file.added > 0 && <span className="text-[#4ec94e]">+{file.added}</span>}
            {file.added > 0 && file.removed > 0 && <span className="text-muted-foreground"> </span>}
            {file.removed > 0 && <span className="text-[#f14c4c]">-{file.removed}</span>}
          </span>
        )}
      </div>
      {isExpanded && <InlineDiff raw={diff} />}
    </>
  )
}

export function ChangedFileList(): ReactElement {
  const changedFiles = useGitStore((s) => s.changedFiles)

  const tracked = changedFiles.filter((f) => f.status !== '?')
  const untracked = changedFiles.filter((f) => f.status === '?')

  if (changedFiles.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        No changes
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      {tracked.length > 0 && (
        <>
          <div className="flex items-center justify-between px-2 pb-0.5 pt-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Changes</span>
            <span className="rounded-full bg-[rgba(78,201,78,0.15)] px-1.5 text-[10px] text-[#4ec994]">
              {tracked.length}
            </span>
          </div>
          {tracked.map((f) => <FileRow key={f.path} file={f} />)}
        </>
      )}
      {untracked.length > 0 && (
        <>
          <div className="flex items-center justify-between border-t border-border px-2 pb-0.5 pt-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Untracked</span>
            <span className="rounded-full bg-accent px-1.5 text-[10px] text-muted-foreground">
              {untracked.length}
            </span>
          </div>
          {untracked.map((f) => <FileRow key={f.path} file={f} />)}
        </>
      )}
    </div>
  )
}
