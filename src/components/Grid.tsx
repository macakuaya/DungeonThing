import { useDroppable } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import { CELL_SIZE_PX, GRID_COLS, GRID_ROWS } from '../tiles'

type GridProps = {
  children?: ReactNode
}

export const GRID_DROPPABLE_ID = 'grid-canvas'

export function Grid({ children }: GridProps) {
  const { setNodeRef, isOver } = useDroppable({ id: GRID_DROPPABLE_ID })

  return (
    <div
      ref={setNodeRef}
      className="grid-canvas"
      style={{
        width: GRID_COLS * CELL_SIZE_PX,
        height: GRID_ROWS * CELL_SIZE_PX,
        backgroundSize: `${CELL_SIZE_PX}px ${CELL_SIZE_PX}px`,
        outline: isOver ? '2px solid var(--accent, #aa3bff)' : '1px solid #2e303a',
      }}
    >
      {children}
    </div>
  )
}
