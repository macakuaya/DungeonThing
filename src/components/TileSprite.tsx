import type { CSSProperties } from 'react'
import { getTileShape, type TileCell, type TileDef } from '../tiles'

type TileSpriteProps = {
  tile: TileDef
  cellSize: number
  rotation?: number
  className?: string
  style?: CSSProperties
}

export function TileSprite({
  tile,
  cellSize,
  rotation = 0,
  className,
  style,
}: TileSpriteProps) {
  const shape = getTileShape(tile, rotation)

  return (
    <div
      className={['tile-sprite', className].filter(Boolean).join(' ')}
      style={{
        width: shape.width * cellSize,
        height: shape.height * cellSize,
        gridTemplateColumns: `repeat(${shape.width}, ${cellSize}px)`,
        gridTemplateRows: `repeat(${shape.height}, ${cellSize}px)`,
        ...style,
      }}
    >
      {shape.cells.flatMap((row, y) =>
        row.map((cell, x) => (
          <div
            key={`${tile.id}-${rotation}-${x}-${y}`}
            className={`tile-cell tile-cell-${cellClass(cell)}`}
          />
        )),
      )}
    </div>
  )
}

function cellClass(cell: TileCell) {
  switch (cell) {
    case 'void':
      return 'void'
    case 'wall':
      return 'wall'
    case 'floor':
      return 'floor'
    case 'door':
      return 'door'
    case 'pillar':
      return 'pillar'
    case 'altar':
      return 'altar'
    case 'pit':
      return 'pit'
    case 'stairs':
      return 'stairs'
    case 'bridge':
      return 'bridge'
    default:
      return 'wall'
  }
}
