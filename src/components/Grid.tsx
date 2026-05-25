import { useDroppable } from '@dnd-kit/core'
import type { PointerEventHandler, ReactNode } from 'react'
import { CELL_SIZE_PX, GRID_COLS, GRID_ROWS } from '../tiles'

type GridProps = {
  children?: ReactNode
  onPointerDown?: PointerEventHandler<HTMLDivElement>
}

export const GRID_DROPPABLE_ID = 'grid-canvas'

export function Grid({ children, onPointerDown }: GridProps) {
  const { setNodeRef } = useDroppable({ id: GRID_DROPPABLE_ID })

  return (
    <div
      ref={setNodeRef}
      className="grid-canvas"
      onPointerDown={onPointerDown}
      style={{
        width: GRID_COLS * CELL_SIZE_PX,
        height: GRID_ROWS * CELL_SIZE_PX,
        backgroundSize: `${CELL_SIZE_PX}px ${CELL_SIZE_PX}px`,
      }}
    >
      {children}
    </div>
  )
}
