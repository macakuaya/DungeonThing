import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { CELL_SIZE_PX, type TileDef } from '../tiles'

type DraggableTileProps = {
  tile: TileDef
}

export function DraggableTile({ tile }: DraggableTileProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `source:${tile.id}`,
      data: { tileId: tile.id, source: 'sidebar' },
    })

  return (
    <button
      ref={setNodeRef}
      className="draggable-tile"
      style={{
        width: tile.width * CELL_SIZE_PX,
        height: tile.height * CELL_SIZE_PX,
        background: tile.color,
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.4 : 1,
        cursor: 'grab',
      }}
      {...listeners}
      {...attributes}
      aria-label={`Drag ${tile.label} tile`}
      title={tile.label}
    >
      <span className="tile-label">
        {tile.label} ({tile.width}x{tile.height})
      </span>
    </button>
  )
}
