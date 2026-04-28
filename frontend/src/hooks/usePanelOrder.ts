import { useState, useCallback } from 'react'

export type PanelGroup = 'prepare' | 'machine'

const LEGACY_STORAGE_KEY = 'sidebar-panel-order'
const STORAGE_KEYS: Record<PanelGroup, string> = {
  prepare: 'sidebar-prepare-panel-order',
  machine: 'sidebar-machine-panel-order',
}

const DEFAULT_ORDERS: Record<PanelGroup, string[]> = {
  prepare: ['position', 'optimization'],
  machine: ['control', 'jog', 'settings'],
}

const isValidOrder = (value: unknown, defaults: string[]) =>
  Array.isArray(value) &&
  value.length === defaults.length &&
  defaults.every((id) => value.includes(id))

const getInitialOrder = (group: PanelGroup) => {
  const defaults = DEFAULT_ORDERS[group]

  try {
    const saved = localStorage.getItem(STORAGE_KEYS[group])
    if (saved) {
      const parsed = JSON.parse(saved)
      if (isValidOrder(parsed, defaults)) {
        return parsed as string[]
      }
    }

    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacy) {
      const parsed = JSON.parse(legacy)
      if (Array.isArray(parsed)) {
        const migrated = parsed.filter((id) => defaults.includes(id))
        if (isValidOrder(migrated, defaults)) {
          return migrated
        }
      }
    }
  } catch {
    // Invalid JSON or unavailable storage, use default.
  }

  return defaults
}

export function usePanelOrder() {
  const [orders, setOrders] = useState<Record<PanelGroup, string[]>>(() => ({
    prepare: getInitialOrder('prepare'),
    machine: getInitialOrder('machine'),
  }))

  const reorder = useCallback((group: PanelGroup, fromIndex: number, toIndex: number) => {
    setOrders((prevOrders) => {
      const currentOrder = prevOrders[group]
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= currentOrder.length ||
        toIndex >= currentOrder.length
      ) {
        return prevOrders
      }

      const newOrder = [...currentOrder]
      const [moved] = newOrder.splice(fromIndex, 1)
      newOrder.splice(toIndex, 0, moved)
      localStorage.setItem(STORAGE_KEYS[group], JSON.stringify(newOrder))

      return {
        ...prevOrders,
        [group]: newOrder,
      }
    })
  }, [])

  return { orders, reorder }
}
