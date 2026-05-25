import { useDraggable } from '@dnd-kit/core'
import { CELL_SIZE_PX, tilesById } from '../tiles'

type PlacedTileProps = {
  placedId: string
  tileId: string
  x: number
  y: number
}

export function PlacedTile({ placedId, tileId, x, y }: PlacedTileProps) {
  const tile = tilesById[tileId]
  if (!tile) return null

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `placed:${placedId}`,
    data: {
      source: 'placed',
      placedId,
      tileId,
    },
  })

  return (
    <div
      ref={setNodeRef}
      className="placed-tile"
      {...listeners}
      {...attributes}
      aria-label={`Move ${tile.label} tile`}
      title={`Move ${tile.label}`}
      style={{
        position: 'absolute',
        left: x * CELL_SIZE_PX,
        top: y * CELL_SIZE_PX,
        width: tile.width * CELL_SIZE_PX,
        height: tile.height * CELL_SIZE_PX,
        background: tile.color,
        opacity: isDragging ? 0.35 : 0.85,
        border: '1px solid rgba(0,0,0,0.4)',
        cursor: 'grab',
        touchAction: 'none',
      }}
    />
  )
}
