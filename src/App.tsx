import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import {
  useAppStore,
  selectFocusedTerminalId,
  type Workspace as WorkspaceModel
} from '@/store/app-store'
import { useNavbarVisibilityStore } from '@/store/navbar-visibility-store'
import { useStatuslineStore } from '@/store/statusline-store'
import { matchAppShortcut } from '@/lib/keybindings'
import { collectLeaves, findLeaf } from '@/lib/layout-tree'
import { isMacPlatform } from '@/lib/platform'
import { nextSystemChromeReveal, systemChromeOffset } from '@/lib/titlebar-chrome'
import { onFullscreenChanged } from '@/tauri/window'
import {
  disposeOrphanTerminals,
  focusTerminal,
  getTerminalCwd,
  isAnyTerminalFocused
} from '@/lib/terminal-registry'
import {
  describeFocusedElement,
  shouldReturnFocus,
  FOCUS_RETURN_ATTR
} from '@/lib/terminal-focus'
import { GuardedPointerSensor } from '@/lib/dnd-sensors'
import { resolveDragEnd, memberDisplayName, MEMBER_DRAG_PREFIX } from '@/lib/war-room-drop'
import { buildIntroText } from '@/lib/war-room-nudge'
import { startWarRoomDelivery } from '@/lib/war-room-delivery'
import { resolvePaneTitle } from '@/lib/pane-title'
import { DEFAULT_TEMPLATE_ID } from '@/lib/templates'
import { FileDropListener } from '@/components/FileDropListener'
import { RightPanel } from '@/components/RightPanel/RightPanel'
import { Navbar } from '@/components/Navbar/Navbar'
import { SettingsView } from '@/components/Settings/SettingsView'
import { TitleBar } from '@/components/TitleBar/TitleBar'
import { Workspace, PaneDragGhost } from '@/components/Workspace/Workspace'
import { Welcome } from '@/components/Welcome/Welcome'
import { WorkspaceTabs } from '@/components/WorkspaceTabs/WorkspaceTabs'
import { useBrowserStore } from '@/store/browser-store'
import { useUpdaterStore } from '@/store/updater-store'
import { PERIODIC_CHECK_INTERVAL_MS, STARTUP_CHECK_DELAY_MS } from '@/lib/updater-flow'
import { onUpdateCheckRequested } from '@/tauri/updater'
import { showMessage } from '@/tauri/dialog'
import { useGitStore } from '@/store/git-store'
import { useRecentsStore } from '@/store/recents-store'
import { useAgentAvailabilityStore } from '@/store/agent-availability-store'
import { useShellAvailabilityStore } from '@/store/shell-availability-store'
import { useTerminalTitleStore } from '@/store/terminal-title-store'
import { useWarRoomStore } from '@/store/war-room-store'
import {
  warRoomJoin,
  warRoomLeave,
  warRoomRooms,
  onWarRoomEvent,
  onWarRoomDeliver,
  onWarRoomRooms
} from '@/tauri/warroom'
import { onPreviewOpen } from '@/tauri/preview'
import { closePreview, openPreview, wirePreviewEvents } from '@/lib/preview-registry'
import { onWorktreeSpawn, onWorktreeRemoved } from '@/tauri/worktree'
import { showWindow } from '@/tauri/window'
import type { CategoryId } from '@/components/Settings/SettingsView'

// Platform never changes at runtime, so a module-level constant is fine.
const isMac = isMacPlatform()

/** Terminal ids referenced by any workspace's layout — the ones to keep alive. */
function liveTerminalIds(workspaces: WorkspaceModel[]): Set<string> {
  const ids = new Set<string>()
  for (const ws of workspaces) {
    for (const leaf of collectLeaves(ws.layout)) ids.add(leaf.terminalId)
  }
  return ids
}

export default function App(): ReactElement {
  const workspaces = useAppStore((s) => s.workspaces)
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId)
  const welcomeFocused = useAppStore((s) => s.welcomeFocused)
  const openWelcome = useAppStore((s) => s.openWelcome)
  const closeWelcome = useAppStore((s) => s.closeWelcome)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<CategoryId>('appearance')
  // Native full-screen state, owned here because both the header's traffic-light
  // inset and the system-chrome dodge below are driven by it.
  const [isFullscreen, setIsFullscreen] = useState(false)

  const gitPanelOpen = useGitStore((s) => s.panelOpen)

  const rightPanelVisible = gitPanelOpen

  // --- pane drag-and-drop: hoisted here (from Workspace.tsx) so the right
  // panel — a sibling of the workspace, not a descendant — can host the War
  // Room drop zone. See lib/war-room-drop.ts for the join/leave/reorder rule.
  const reorderPane = useAppStore((s) => s.reorderPane)
  const [draggingLeafId, setDraggingLeafId] = useState<string | null>(null)
  // Restore the right panel exactly as it was when a drag reveals it and the
  // drop lands elsewhere — revealing the zone must not permanently flip tabs.
  const panelBeforeDragRef = useRef<{ open: boolean; mode: 'browser' | 'git' | 'warroom' } | null>(null)
  const dndSensors = useSensors(
    useSensor(GuardedPointerSensor, { activationConstraint: { distance: 5 } })
  )
  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId)
  const draggingLeaf =
    draggingLeafId && !draggingLeafId.startsWith(MEMBER_DRAG_PREFIX) && activeWs
      ? findLeaf(activeWs.layout, draggingLeafId)
      : null

  const restorePanelIfNoDrop = useCallback((): void => {
    const prior = panelBeforeDragRef.current
    panelBeforeDragRef.current = null
    if (!prior) return
    const git = useGitStore.getState()
    git.setMode(prior.mode === 'warroom' ? 'warroom' : prior.mode)
    git.setPanelOpen(prior.open)
  }, [])

  const joinWarRoom = useCallback((leafId: string, roomId: string): void => {
    const st = useAppStore.getState()
    const ws = st.workspaces.find((w) => w.id === st.activeWorkspaceId)
    const leaf = ws ? findLeaf(ws.layout, leafId) : null
    if (!ws || !leaf) {
      restorePanelIfNoDrop() // no target pane — don't leave the panel flipped
      return
    }
    // Re-dropping a pane that's already a member of THIS room must not
    // re-enqueue the execute-shaped intro: that would burn another agent turn
    // for nothing. A pane dragged into a DIFFERENT room still arrives here
    // (not through moveMember, which only handles member-chip drags), so the
    // guard compares rooms rather than just membership.
    const priorRoomId = useWarRoomStore.getState().memberRoomId(leaf.terminalId)
    const alreadyMember = priorRoomId === roomId
    const resolvedAgent = leaf.agentId ?? DEFAULT_TEMPLATE_ID
    // 'terminal' is the plain shell template — a member, but never nudged and
    // never an execute target (the backend enforces the latter).
    const agentId = resolvedAgent === DEFAULT_TEMPLATE_ID ? undefined : resolvedAgent
    const cwd = getTerminalCwd(leaf.terminalId) ?? leaf.cwd ?? ws.cwd
    // Folder-disambiguated: two joined panes running the same agent (e.g. two
    // "Claude Code" instances) would otherwise show identical chips and
    // "Claude Code → Claude Code" transcript rows with no way to tell them
    // apart. Computed AFTER cwd is resolved above.
    const displayName = memberDisplayName(
      resolvePaneTitle(resolvedAgent, useTerminalTitleStore.getState().titles[leaf.terminalId]),
      cwd
    )
    const st2 = useWarRoomStore.getState()
    const peers = (st2.membersByRoom[roomId] ?? [])
      .filter((m) => m.terminalId !== leaf.terminalId)
      .map((m) => m.name)
    const roomName = st2.rooms.find((r) => r.roomId === roomId)?.name ?? 'War Room'
    void warRoomJoin({ roomId, terminalId: leaf.terminalId, agentId, cwd, displayName })
      .then(() => {
        // Same event-vs-response ordering guarantee as moveMember's
        // enqueueIntro below (see its comment): if this join was itself a
        // move (priorRoomId !== roomId), the old room's Leave has already
        // applied by the time we get here, so this enqueue lands clean.
        if (agentId && !alreadyMember) {
          useWarRoomStore.getState().enqueueIntro(leaf.terminalId, buildIntroText(roomName, peers))
        }
        useGitStore.getState().setMode('warroom')
        panelBeforeDragRef.current = null // drop landed — keep the panel on War Room
      })
      .catch((e) => {
        console.warn('war room join failed:', e)
        restorePanelIfNoDrop() // join failed — don't leave the panel flipped to War Room
      })
  }, [restorePanelIfNoDrop])

  const moveMember = useCallback((terminalId: string, roomId: string): void => {
    const st = useWarRoomStore.getState()
    const fromRoom = st.memberRoomId(terminalId)
    const member =
      fromRoom !== null ? st.membersByRoom[fromRoom]?.find((m) => m.terminalId === terminalId) : undefined
    if (!member) return
    const peers = (st.membersByRoom[roomId] ?? []).map((m) => m.name)
    const roomName = st.rooms.find((r) => r.roomId === roomId)?.name ?? 'War Room'
    void warRoomJoin({
      roomId,
      terminalId,
      agentId: member.agentId ?? undefined,
      cwd: member.cwd,
      displayName: member.name
    })
      .then(() => {
        // A move resets the handshake (new room, new pending state); the intro
        // tells the agent to call list_peers, which reconnects it immediately.
        //
        // Ordering note — the first place in this file where event-vs-response
        // ordering is load-bearing, hence written down: the backend emits this
        // terminal's Leave(oldRoom) then Join(newRoom) BEFORE the `war_room_join`
        // invoke resolves, and Tauri delivers both events through the same
        // web-content queue ahead of the response. So by the time this .then
        // runs, applyEvent's 'leave' branch has already cleared this terminal's
        // queue — the enqueueIntro below can't be swallowed by its own move.
        if (member.agentId) {
          useWarRoomStore.getState().enqueueIntro(terminalId, buildIntroText(roomName, peers))
        }
      })
      .catch((e) => console.warn('war room move failed:', e))
  }, [])

  function handleDragStart(id: string): void {
    setDraggingLeafId(id)
    if (id.startsWith(MEMBER_DRAG_PREFIX)) return
    const git = useGitStore.getState()
    panelBeforeDragRef.current = { open: git.panelOpen, mode: git.mode }
    git.setMode('warroom') // reveal the drop zone while the pane is in flight
  }

  function handleDragEnd(activeId: string, overId: string | null): void {
    setDraggingLeafId(null)
    const st = useWarRoomStore.getState()
    const action = resolveDragEnd(activeId, overId, {
      activeRoomId: st.activeRoomId,
      memberRoomId: st.memberRoomId
    })
    if (action.kind === 'join') {
      joinWarRoom(action.leafId, action.roomId)
      return
    }
    if (action.kind === 'move') {
      moveMember(action.terminalId, action.roomId)
      return
    }
    restorePanelIfNoDrop()
    if (action.kind === 'reorder') reorderPane(action.activeLeafId, action.overLeafId)
    else if (action.kind === 'leave') void warRoomLeave(action.terminalId)
  }

  const noWorkspaces = workspaces.length === 0
  // Welcome shows when explicitly focused, or forced (uncloseable) when none exist.
  const showWelcome = welcomeFocused || noWorkspaces
  const welcomeClosable = !noWorkspaces

  useEffect(() => {
    void showWindow()
    useRecentsStore.getState().hydrate()
    void useAgentAvailabilityStore.getState().refresh()
    void useShellAvailabilityStore.getState().refresh()
    void useStatuslineStore.getState().sync()
  }, [])

  // Esc closes the Welcome page when it's closeable and Settings isn't covering it.
  useEffect(() => {
    if (!showWelcome || !welcomeClosable || settingsOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeWelcome()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showWelcome, welcomeClosable, settingsOpen, closeWelcome])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      // Esc exits broadcast mode (which clears the group).
      if (e.key === 'Escape') {
        // ModeratorComposer also treats Escape as its own gesture (blur, hand
        // the keyboard back to the terminal) — but this listener is capture-
        // phase on `window`, so it runs BEFORE the composer's own keydown
        // handler and a `stopPropagation()` there can't stop it. Without this
        // guard, pressing Esc to leave the composer would also blow away a
        // hand-built broadcast group with no undo.
        //
        // shouldReturnFocus alone is not enough: it treats every <textarea>
        // as owning the keyboard (see terminal-focus.ts), and xterm's own
        // hidden input IS a <textarea> — so gating on it alone would ALSO
        // swallow Escape while a terminal has focus, which is the ordinary,
        // overwhelmingly common way this shortcut gets used (you exit
        // broadcast mode from inside the terminal you were typing into).
        // isAnyTerminalFocused() carves that one case back out; every OTHER
        // editable widget (the composer, a rename field, an open menu) still
        // blocks the toggle exactly as shouldReturnFocus already decides.
        if (!isAnyTerminalFocused() && !shouldReturnFocus(describeFocusedElement(document.activeElement))) {
          return
        }
        const st = useAppStore.getState()
        const ws = st.workspaces.find((w) => w.id === st.activeWorkspaceId)
        if (ws?.broadcastActive) {
          e.preventDefault()
          st.toggleBroadcast()
          return
        }
      }
      // Cmd+B / Cmd+Shift+B on mac, Ctrl+B / Ctrl+Shift+B elsewhere.
      // If these bindings change, update src/lib/keybindings.ts.
      const action = matchAppShortcut(e, isMac)
      if (action === 'toggle-broadcast') {
        e.preventDefault()
        useAppStore.getState().toggleBroadcast()
        return
      }
      if (action === 'toggle-navbar') {
        e.preventDefault()
        useNavbarVisibilityStore.getState().toggle()
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [])

  // --- keyboard focus belongs to the terminal -----------------------------
  // The shell owns the keyboard; app chrome only borrows it. dnd-kit makes its
  // drag nodes focusable (tabIndex 0 on tabs, navbar items, pane roots), so a
  // click parks DOM focus on chrome and every keystroke is dropped until the
  // user clicks back into the pane — and a Tab (shell completion) walks the
  // focus ring across the tab titles instead. These three effects hand focus
  // back; see `lib/terminal-focus.ts`.

  // Read inside the window listeners below, which are registered once and must
  // not capture a stale value.
  const settingsOpenRef = useRef(settingsOpen)
  settingsOpenRef.current = settingsOpen

  /** Focus the active workspace's focused terminal, unless something is typing. */
  const returnFocusToTerminal = useCallback(() => {
    // Settings is a modal without a focus trap: its Esc handler lives on the
    // document, so it keeps working — but pulling focus behind it would type
    // the user's keystrokes into the shell while they look at the dialog.
    if (settingsOpenRef.current) return
    if (useAppStore.getState().welcomeFocused) return
    if (!shouldReturnFocus(describeFocusedElement(document.activeElement))) return
    const terminalId = selectFocusedTerminalId(useAppStore.getState())
    if (terminalId) focusTerminal(terminalId)
  }, [])

  /**
   * Same, but scheduled to land after everyone else's focus work: Radix menus
   * and the rename input claim focus on a timeout, and dnd-kit re-focuses the
   * dragged node in a requestAnimationFrame when a drag ends. Running last is
   * what lets the activeElement check above be trusted — if a menu or an input
   * legitimately took the keyboard, it already holds it by now.
   */
  const deferReturnFocusToTerminal = useCallback(() => {
    requestAnimationFrame(() => setTimeout(returnFocusToTerminal, 0))
  }, [returnFocusToTerminal])

  // 1. Landing on a workspace: switching tabs, leaving Welcome, closing
  //    Settings. Workspaces stay mounted (see the render below), so the target
  //    pane never remounts and TerminalPane's isFocused effect never re-runs —
  //    nothing else would pull focus off the tab that was clicked. Deferred so
  //    it also beats Radix restoring focus to the Settings trigger on close.
  useEffect(() => {
    if (showWelcome || settingsOpen) return
    deferReturnFocusToTerminal()
  }, [activeWorkspaceId, showWelcome, settingsOpen, deferReturnFocusToTerminal])

  // 2. Pointer gestures on chrome that has no keyboard use of its own — every
  //    region marked `data-focus-return`: title bar, sidebar, tab strip, panes
  //    and their split separators. `pointerup` (not just `click`)
  //    because a finished drag swallows the click — and dnd-kit's own
  //    focus-restore would otherwise leave the keyboard on the dragged tab.
  //    `click` is kept alongside it for keyboard-activated buttons, which fire
  //    no pointer events; a double return-focus is a harmless no-op.
  useEffect(() => {
    const onPointerUp = (event: Event): void => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest(`[${FOCUS_RETURN_ATTR}]`) === null) return
      deferReturnFocusToTerminal()
    }
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('click', onPointerUp)
    return () => {
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('click', onPointerUp)
    }
  }, [deferReturnFocusToTerminal])

  // 3. Regaining the window — close-to-tray, Cmd+Tab, or a click on the title
  //    bar. The webview restores focus to whatever held it last, which after a
  //    tray round-trip is the document body.
  useEffect(() => {
    window.addEventListener('focus', deferReturnFocusToTerminal)
    return () => window.removeEventListener('focus', deferReturnFocusToTerminal)
  }, [deferReturnFocusToTerminal])

  // --- macOS full screen: get out from under the auto-hiding system chrome ---
  // In full screen macOS slides the menu bar + titlebar down ON TOP of the app
  // the moment the pointer touches the top edge of the screen, burying our
  // header and half the tab strip. The pointer is the only signal a webview
  // gets, and it is enough: shift the app down by the band the OS is about to
  // occupy, so the revealed chrome lands in empty space (see lib/titlebar-chrome).
  const [systemChromeRevealed, setSystemChromeRevealed] = useState(false)

  useEffect(() => {
    if (!isMac) return // no auto-hiding titlebar to dodge off macOS
    let unlisten: (() => void) | undefined
    onFullscreenChanged(setIsFullscreen).then((un) => (unlisten = un))
    return () => unlisten?.()
  }, [])

  useEffect(() => {
    if (!isMac || !isFullscreen) {
      setSystemChromeRevealed(false)
      return
    }
    const onMove = (e: MouseEvent): void => {
      setSystemChromeRevealed((prev) => nextSystemChromeReveal(prev, e.clientY))
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [isFullscreen])

  const chromeOffset = systemChromeOffset(isMac, isFullscreen, systemChromeRevealed)

  // Kill orphaned PTYs and close previews when terminals leave all layouts.
  useEffect(
    () =>
      useAppStore.subscribe((state) => {
        const live = liveTerminalIds(state.workspaces)
        disposeOrphanTerminals(live)
        const { previews } = useBrowserStore.getState()
        for (const terminalId of Object.keys(previews)) {
          if (!live.has(terminalId)) closePreview(terminalId)
        }
        // Titles are keyed by terminalId outside the layout tree (see
        // terminal-title-store) — sweep them the same way previews are, or a
        // closed pane's title lingers in the store for the rest of the session.
        const { titles, clearTitle } = useTerminalTitleStore.getState()
        for (const terminalId of Object.keys(titles)) {
          if (!live.has(terminalId)) clearTitle(terminalId)
        }
        // War Room members whose terminal left every layout: the Rust
        // auto-leave on pty death normally beats us here — this sweep is the
        // belt-and-braces for any path that drops a pane without killing it.
        // warRoomLeave is idempotent, so racing the backend is harmless.
        // Iterate every room's slice — the sweep doesn't just target whatever
        // room is currently shown in the panel.
        for (const ms of Object.values(useWarRoomStore.getState().membersByRoom)) {
          for (const m of ms) {
            if (!live.has(m.terminalId)) void warRoomLeave(m.terminalId)
          }
        }
      }),
    []
  )

  // Wire MCP preview:open events to the per-terminal preview. Background
  // terminals update silently — the panel is only revealed when the event
  // belongs to the terminal the user is looking at.
  useEffect(() => {
    const unlisten = onPreviewOpen((e) => {
      openPreview(e.terminalId, e.url)
      const st = useAppStore.getState()
      const ws = st.workspaces.find((w) => w.id === st.activeWorkspaceId)
      const focused = ws ? findLeaf(ws.layout, ws.focusedLeafId)?.terminalId : undefined
      if (focused === e.terminalId) {
        useGitStore.getState().setMode('browser')
        // Creating a native webview can grab OS focus out from under the
        // pane — same landing-after-everyone defence the drag/menu paths use.
        deferReturnFocusToTerminal()
      }
    })
    return () => {
      void unlisten.then((fn) => fn())
    }
  }, [deferReturnFocusToTerminal])

  // Wire native webview navigation/title/loading and denied-popup events into
  // the store — see lib/preview-registry.ts. Mount-once: the registry itself
  // is a module singleton, this just attaches its listeners for the app's life.
  useEffect(() => wirePreviewEvents(), [])

  // Silent update checks: one a few seconds after boot (never competing with
  // pty spawn), then periodically — Swarmterm runs for days, and the navbar
  // update button only ever appears through these. Failures are swallowed by
  // the flow reducer. The periodic tick only fires from idle so it can never
  // clobber a known update or an in-flight download.
  useEffect(() => {
    const check = () => void useUpdaterStore.getState().check(false)
    const t = window.setTimeout(check, STARTUP_CHECK_DELAY_MS)
    const i = window.setInterval(() => {
      if (useUpdaterStore.getState().state.phase === 'idle') check()
    }, PERIODIC_CHECK_INTERVAL_MS)
    return () => {
      window.clearTimeout(t)
      window.clearInterval(i)
    }
  }, [])

  // Tray "Check for Updates…" → manual check (talkative: reports up-to-date
  // and failures in a native dialog).
  useEffect(() => {
    const unlisten = onUpdateCheckRequested(() => void useUpdaterStore.getState().check(true))
    return () => void unlisten.then((fn) => fn())
  }, [])

  // Manual-check verdicts land as native OS dialogs, not DOM — nothing to
  // position over the terminal. Subscribed outside the render path so the
  // per-chunk download progress never re-renders App. Dismiss BEFORE the
  // dialog: the machine is already idle while the dialog waits for OK.
  useEffect(() => {
    return useUpdaterStore.subscribe((cur, prev) => {
      if (cur.state.phase === prev.state.phase) return
      if (cur.state.phase === 'upToDate') {
        useUpdaterStore.getState().dismiss()
        void showMessage('Swarmterm is up to date.', { title: 'Swarmterm' })
      } else if (cur.state.phase === 'error') {
        const detail = cur.state.message
        useUpdaterStore.getState().dismiss()
        void showMessage(`Update check failed:\n${detail}`, { title: 'Swarmterm', kind: 'error' })
      }
    })
  }, [])

  // Wire MCP worktree tool events to store actions: spawn opens a worker pane,
  // removed clears the binding and relocates the pane back to the workspace folder.
  useEffect(() => {
    const unSpawn = onWorktreeSpawn((e) => {
      useAppStore.getState().spawnWorktreePane({
        requesterTerminalId: e.requesterTerminalId,
        path: e.path,
        branch: e.branch,
        agentId: e.agent ?? undefined,
        prompt: e.prompt
      })
    })
    const unRemoved = onWorktreeRemoved((e) => {
      useAppStore.getState().clearWorktreeBinding(e.path)
    })
    return () => {
      void unSpawn.then((f) => f())
      void unRemoved.then((f) => f())
    }
  }, [])

  // War Room: transcript/membership events feed the store; deliver events queue
  // nudges/prompts typed into idle panes by the delivery wiring.
  useEffect(() => {
    const stopDelivery = startWarRoomDelivery()
    const unEvent = onWarRoomEvent((e) => useWarRoomStore.getState().applyEvent(e))
    const unDeliver = onWarRoomDeliver((d) => useWarRoomStore.getState().enqueue(d))
    // Room list can change independent of membership (create/rename/delete);
    // keep it live so a room disappearing mid-session tears down its slice.
    const unRooms = onWarRoomRooms((rooms) => useWarRoomStore.getState().applyRooms(rooms))
    // Membership lives Rust-side and outlives renderer reloads (dev HMR,
    // crash-restore) — hydrate so the panel never shows an empty room while
    // the server still routes messages.
    void warRoomRooms()
      .then((list) => useWarRoomStore.getState().hydrateRooms(list))
      .catch(() => {}) // matches the existing hydration's error posture
    return () => {
      stopDelivery()
      void unEvent.then((f) => f())
      void unDeliver.then((f) => f())
      void unRooms.then((f) => f())
    }
  }, [])

  return (
    <div
      // translateY, not padding or a spacer: those would shrink the app's height,
      // and a height change reflows every xterm and resizes its pty — line-wrap
      // churn in a TUI every time the pointer grazes the top of the screen. A
      // transform slides the whole app down as one block; the bottom few rows go
      // off-screen for as long as the overlay is up, and nothing re-lays out.
      style={{
        transform: `translateY(${chromeOffset}px)`,
        transition: 'transform 150ms ease-out'
      }}
      className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground"
    >
      <FileDropListener />
      <TitleBar fullscreen={isFullscreen} />

      <div className="relative flex min-h-0 flex-1">
        <Navbar
          onNewWorkspace={openWelcome}
          settingsOpen={settingsOpen}
          onToggleSettings={() => {
            setSettingsTab('appearance')
            setSettingsOpen((open) => !open)
          }}
        />

        <main className="relative flex min-w-0 flex-1 flex-col">
          {/* Workspaces stay mounted and visible whether Settings is open or
              not — the Settings modal dims them behind its backdrop, and their
              terminals (and PTYs) survive a Settings detour. */}
          <div className="flex min-h-0 flex-1 flex-col">
            <WorkspaceTabs onNewWorkspace={openWelcome} />

            <div className="relative min-h-0 flex-1 bg-canvas">
              {/* Workspace(s) left, right panel (Preview/Git/War Room) when
                  toggled on. DndContext lives here, above both, so a pane
                  dragged out of the workspace can be dropped on the War Room
                  panel sitting beside it — see lib/war-room-drop.ts. */}
              <DndContext
                sensors={dndSensors}
                collisionDetection={pointerWithin}
                onDragStart={(e) => handleDragStart(String(e.active.id))}
                onDragEnd={(e) => handleDragEnd(String(e.active.id), e.over ? String(e.over.id) : null)}
                onDragCancel={() => {
                  setDraggingLeafId(null)
                  restorePanelIfNoDrop()
                }}
              >
                <Group
                  key={rightPanelVisible ? 'split' : 'solo'}
                  orientation="horizontal"
                  className="h-full w-full"
                  defaultLayout={rightPanelVisible ? { 'app-workspace': 70, 'app-browser': 30 } : { 'app-workspace': 100 }}
                >
                  <Panel id="app-workspace" minSize="30%" className="relative h-full w-full overflow-hidden">
                    {workspaces.map((ws) => (
                      <div
                        key={ws.id}
                        className="absolute inset-0"
                        style={{ display: ws.id === activeWorkspaceId ? 'block' : 'none' }}
                      >
                        <Workspace workspace={ws} />
                      </div>
                    ))}
                  </Panel>

                  {rightPanelVisible && (
                    <>
                      <Separator
                        className="w-1 shrink-0 cursor-col-resize bg-canvas transition-colors hover:bg-ring data-[separator]:bg-canvas"
                      />
                      <Panel id="app-browser" minSize="20%" maxSize="50%" className="h-full w-full overflow-hidden">
                        <RightPanel />
                      </Panel>
                    </>
                  )}
                </Group>
                <DragOverlay>
                  {draggingLeaf ? <PaneDragGhost leaf={draggingLeaf} /> : null}
                </DragOverlay>
              </DndContext>

              {showWelcome && (
                <div className="absolute inset-0 z-20 overflow-y-auto bg-canvas">
                  <Welcome />
                </div>
              )}
            </div>
          </div>

        </main>

        {settingsOpen && (
          <SettingsView
            key={settingsTab}
            onClose={() => setSettingsOpen(false)}
            initialCategory={settingsTab}
          />
        )}
      </div>
    </div>
  )
}
