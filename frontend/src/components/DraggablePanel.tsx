import React, { useRef, useEffect } from 'react'
import { useDrag, useDrop, useDragLayer } from 'react-dnd'
import { getEmptyImage } from 'react-dnd-html5-backend'
import { DotsSixVertical, CaretDown } from '@phosphor-icons/react'
import type { Identifier, XYCoord } from 'dnd-core'

const PANEL_TYPE = 'SIDEBAR_PANEL'

interface DragItem {
  index: number
  id: string
  type: string
  initialX: number
  width: number
  title: string
}

interface DraggablePanelProps {
  id: string
  index: number
  title: string
  children: React.ReactElement
  onReorder: (fromIndex: number, toIndex: number) => void
}

// Custom drag layer that constrains movement to y-axis
export function PanelDragLayer() {
  const { itemType, isDragging, item, currentOffset } = useDragLayer((monitor) => ({
    item: monitor.getItem() as DragItem | null,
    itemType: monitor.getItemType(),
    currentOffset: monitor.getClientOffset(),
    isDragging: monitor.isDragging(),
  }))

  if (!isDragging || itemType !== PANEL_TYPE || !currentOffset || !item) {
    return null
  }

  // Constrain x to initial position, only move on y-axis
  const transform = `translate(${item.initialX}px, ${currentOffset.y - 20}px)`

  return (
    <div
      style={{
        position: 'fixed',
        pointerEvents: 'none',
        zIndex: 100,
        left: 0,
        top: 0,
        width: item.width,
      }}
    >
      <div
        style={{ transform }}
        className="bg-card border border-foreground/10 shadow-lg"
      >
        <div className="flex w-full items-center border-b border-foreground/5">
          <div className="flex items-center justify-center px-2 py-4 cursor-grabbing text-foreground/60">
            <DotsSixVertical weight="bold" className="size-4" />
          </div>
          <div className="flex flex-1 items-center justify-between text-xs font-medium py-4 pr-4">
            <span>{item.title}</span>
            <CaretDown weight="bold" className="size-3 text-foreground/60" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function DraggablePanel({ id, index, title, children, onReorder }: DraggablePanelProps) {
  const ref = useRef<HTMLDivElement>(null)

  const [{ handlerId }, drop] = useDrop<DragItem, void, { handlerId: Identifier | null }>({
    accept: PANEL_TYPE,
    collect(monitor) {
      return {
        handlerId: monitor.getHandlerId(),
      }
    },
    hover(item: DragItem, monitor) {
      if (!ref.current) {
        return
      }
      const dragIndex = item.index
      const hoverIndex = index

      // Don't replace items with themselves
      if (dragIndex === hoverIndex) {
        return
      }

      // Determine rectangle on screen
      const hoverBoundingRect = ref.current?.getBoundingClientRect()

      // Get vertical middle
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2

      // Determine mouse position
      const clientOffset = monitor.getClientOffset()

      // Get pixels to the top
      const hoverClientY = (clientOffset as XYCoord).y - hoverBoundingRect.top

      // Only perform the move when the mouse has crossed half of the items height
      // When dragging downwards, only move when the cursor is below 50%
      // When dragging upwards, only move when the cursor is above 50%

      // Dragging downwards
      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) {
        return
      }

      // Dragging upwards
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
        return
      }

      // Time to actually perform the action
      onReorder(dragIndex, hoverIndex)

      // Note: we're mutating the monitor item here!
      // Generally it's better to avoid mutations,
      // but it's good here for the sake of performance
      // to avoid expensive index searches.
      item.index = hoverIndex
    },
  })

  const [{ isDragging }, drag, preview] = useDrag({
    type: PANEL_TYPE,
    item: () => {
      const rect = ref.current?.getBoundingClientRect()
      return {
        id,
        index,
        title,
        initialX: rect?.left ?? 0,
        width: rect?.width ?? 320,
      }
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  })

  // Use empty image as drag preview (we'll render custom layer)
  useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true })
  }, [preview])

  // Connect drop target to the panel
  drop(ref)

  return (
    <div
      ref={ref}
      data-handler-id={handlerId}
      className={isDragging ? 'opacity-40' : 'opacity-100'}
    >
      {React.cloneElement(children, { dragRef: drag })}
    </div>
  )
}
