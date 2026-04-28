import { useState, useCallback } from 'react'

const STORAGE_KEY = 'sidebar-panel-order'
const DEFAULT_ORDER = ['position', 'optimization', 'control', 'jog', 'settings']

export function usePanelOrder() {
  const [order, setOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        // Validate that all default panels are present
        if (Array.isArray(parsed) && DEFAULT_ORDER.every(id => parsed.includes(id))) {
          return parsed
        }
      }
    } catch {
      // Invalid JSON, use default
    }
    return DEFAULT_ORDER
  })

  const reorder = useCallback((fromIndex: number, toIndex: number) => {
    setOrder(prevOrder => {
      const newOrder = [...prevOrder]
      const [moved] = newOrder.splice(fromIndex, 1)
      newOrder.splice(toIndex, 0, moved)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newOrder))
      return newOrder
    })
  }, [])

  return { order, reorder }
}
