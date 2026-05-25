// Source-of-truth catalogue of tiles available in the sidebar.
// Width and height are measured in grid cells (1 cell = 5 ft in D&D terms).

export type TileDef = {
  id: string
  label: string
  color: string
  width: number
  height: number
}

export const FEET_PER_CELL = 5
export const CELL_SIZE_PX = 32
export const GRID_COLS = 30
export const GRID_ROWS = 30

export const TILES: TileDef[] = [
  { id: 'blue', label: 'Blue', color: '#3b82f6', width: 4, height: 4 },
  { id: 'red', label: 'Red', color: '#ef4444', width: 4, height: 4 },
  { id: 'green', label: 'Green', color: '#22c55e', width: 4, height: 4 },
  { id: 'yellow', label: 'Yellow', color: '#eab308', width: 4, height: 4 },
]

export const tilesById: Record<string, TileDef> = Object.fromEntries(
  TILES.map((t) => [t.id, t]),
)
