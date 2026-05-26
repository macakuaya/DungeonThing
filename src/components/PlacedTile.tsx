import { useDraggable } from '@dnd-kit/core'
import { CELL_SIZE_PX, getTileShape, tilesById } from '../tiles'
import { TileSprite } from './TileSprite'

type PlacedTileProps = {
  placedId: string
  tileId: string
  rotation: number
  x: number
  y: number
  selected: boolean
  onSelect: (placedId: string) => void
}

export function PlacedTile({
  placedId,
  tileId,
  rotation,
  x,
  y,
  selected,
  onSelect,
}: PlacedTileProps) {
  const tile = tilesById[tileId]
  if (!tile) return null
  const shape = getTileShape(tile, rotation)

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `placed:${placedId}`,
    data: {
      source: 'placed',
      placedId,
      tileId,
      rotation,
    },
  })

  return (
    <div
      ref={setNodeRef}
      className={`placed-tile ${selected ? 'placed-tile-selected' : ''}`.trim()}
      {...listeners}
      {...attributes}
      aria-label={`Move ${tile.label} tile`}
      title={`Move ${tile.label}`}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(placedId)
      }}
      style={{
        position: 'absolute',
        left: x * CELL_SIZE_PX,
        top: y * CELL_SIZE_PX,
        width: shape.width * CELL_SIZE_PX,
        height: shape.height * CELL_SIZE_PX,
        opacity: isDragging ? 0.3 : 0.62,
        border: '1px solid rgba(0,0,0,0.4)',
        cursor: 'grab',
        touchAction: 'none',
      }}
    >
      <TileSprite tile={tile} rotation={rotation} cellSize={CELL_SIZE_PX} />
    </div>
  )
}
