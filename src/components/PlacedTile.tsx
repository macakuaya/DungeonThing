import { CELL_SIZE_PX, tilesById } from '../tiles'

type PlacedTileProps = {
  tileId: string
  x: number
  y: number
}

export function PlacedTile({ tileId, x, y }: PlacedTileProps) {
  const tile = tilesById[tileId]
  if (!tile) return null

  return (
    <div
      className="placed-tile"
      style={{
        position: 'absolute',
        left: x * CELL_SIZE_PX,
        top: y * CELL_SIZE_PX,
        width: tile.width * CELL_SIZE_PX,
        height: tile.height * CELL_SIZE_PX,
        background: tile.color,
        opacity: 0.85,
        border: '1px solid rgba(0,0,0,0.4)',
        pointerEvents: 'none',
      }}
    />
  )
}
