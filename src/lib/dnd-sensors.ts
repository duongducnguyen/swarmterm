import { PointerSensor } from '@dnd-kit/core'
import type { PointerEvent as ReactPointerEvent } from 'react'

/** True when the gesture began inside an element opting out of drag. */
function startsInNoDndZone(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('[data-no-dnd]') !== null
}

/**
 * A PointerSensor that ignores gestures starting inside a `[data-no-dnd]`
 * element — e.g. close buttons and dropdown triggers that own their own click,
 * so a pointer-down on them never starts a drag.
 */
export class GuardedPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: ({ nativeEvent: event }: ReactPointerEvent): boolean => {
        if (!event.isPrimary || event.button !== 0 || startsInNoDndZone(event.target)) {
          return false
        }
        return true
      }
    }
  ]
}
