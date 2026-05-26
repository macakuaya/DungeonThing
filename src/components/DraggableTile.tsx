import { useDraggable } from '@dnd-kit/core'
import { type TileDef } from '../tiles'
import { TileSprite } from './TileSprite'

type DraggableTileProps = {
  tile: TileDef
}

export function DraggableTile({ tile }: DraggableTileProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `source:${tile.id}`,
    data: { tileId: tile.id, source: 'sidebar' },
  })

  return (
    <button
      ref={setNodeRef}
      className="draggable-tile"
      style={{
        opacity: isDragging ? 0.35 : 1,
        cursor: 'grab',
      }}
      {...listeners}
      {...attributes}
      aria-label={`Drag ${tile.label} tile`}
      title={tile.label}
    >
      <TileSprite tile={tile} cellSize={12} className="draggable-tile-sprite" />
      <span className="tile-label">
        {tile.label} ({tile.width}x{tile.height})
      </span>
    </button>
  )
}
