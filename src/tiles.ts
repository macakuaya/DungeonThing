// Source-of-truth catalogue of tiles available in the sidebar.
// Width and height are measured in grid cells (1 cell = 5 ft in D&D terms).

export type TileCell =
  | 'void'
  | 'wall'
  | 'floor'
  | 'door'
  | 'pillar'
  | 'altar'
  | 'pit'
  | 'stairs'
  | 'bridge'

export type TileCategory = 'connector' | 'room' | 'special'
export type RotationDeg = 0 | 90 | 180 | 270

export type TileDef = {
  id: string
  label: string
  category: TileCategory
  width: number
  height: number
  cells: TileCell[][]
  tint: string
}

export type TileShape = {
  width: number
  height: number
  cells: TileCell[][]
}

export const FEET_PER_CELL = 5
export const CELL_SIZE_PX = 32
export const GRID_COLS = 30
export const GRID_ROWS = 30

function charToCell(char: string): TileCell {
  switch (char) {
    case '_':
      return 'void'
    case '#':
      return 'wall'
    case '.':
      return 'floor'
    case 'D':
      return 'door'
    case 'P':
      return 'pillar'
    case 'A':
      return 'altar'
    case 'O':
      return 'pit'
    case 'S':
      return 'stairs'
    case 'B':
      return 'bridge'
    default:
      return 'wall'
  }
}

function makeCells(rows: string[]) {
  return rows.map((row) => row.split('').map(charToCell))
}

function tile(
  id: string,
  label: string,
  category: TileCategory,
  rows: string[],
  tint: string,
): TileDef {
  const width = rows[0]?.length ?? 0
  const valid = rows.length > 0 && rows.every((row) => row.length === width)
  if (!valid) throw new Error(`Invalid tile shape for ${id}`)
  return {
    id,
    label,
    category,
    width,
    height: rows.length,
    cells: makeCells(rows),
    tint,
  }
}

export const TILES: TileDef[] = [
  // Connectors (2-square corridors)
  tile(
    'corridor-straight',
    'Straight Corridor',
    'connector',
    ['#DD#', '#..#', '#..#', '#..#', '#..#', '#..#', '#..#', '#DD#'],
    '#64748b',
  ),
  tile(
    'corridor-corner',
    'Corner Connector',
    'connector',
    ['__DD', '__..', '_...', '_D..'],
    '#475569',
  ),
  tile(
    'corridor-t',
    'T-Junction',
    'connector',
    ['#DD#', '#..#', 'D..D', '####'],
    '#334155',
  ),
  tile(
    'corridor-cross',
    'Crossroads',
    'connector',
    ['#DD#', 'D..D', 'D..D', '#DD#'],
    '#1f2937',
  ),
  tile(
    'corridor-offset',
    'Offset Connector',
    'connector',
    ['__DD', '__..', '_...', '#..#', '#..#', '..._', '..__', 'DD__'],
    '#4b5563',
  ),
  tile(
    'narrow-bridge',
    'Narrow Bridge',
    'connector',
    ['ODDO', 'OBBO', 'OBBO', 'OBBO', 'OBBO', 'OBBO', 'OBBO', 'ODDO'],
    '#6b7280',
  ),

  // Combat rooms
  tile('room-small', 'Small Room', 'room', ['#DD#', '#..#', '#..#', '#DD#'], '#374151'),
  tile(
    'room-medium-hall',
    'Medium Hall',
    'room',
    [
      '###DD###',
      '#......#',
      '#..PP..#',
      'D......D',
      'D......D',
      '#..PP..#',
      '#......#',
      '###DD###',
    ],
    '#111827',
  ),
  tile(
    'room-pillar',
    'Pillar Room',
    'room',
    [
      '###DD###',
      '#......#',
      '#.P..P.#',
      'D......D',
      'D......D',
      '#.P..P.#',
      '#......#',
      '###DD###',
    ],
    '#1e293b',
  ),

  // Special
  tile(
    'room-split-level',
    'Split-Level Chamber',
    'special',
    [
      '###DD###',
      '#......#',
      '#..SS..#',
      'D..SS..D',
      'D......D',
      '#..SS..#',
      '#......#',
      '###DD###',
    ],
    '#0f172a',
  ),
  tile(
    'room-altar',
    'Altar Chamber',
    'special',
    [
      '###DD###',
      '#......#',
      '#..PP..#',
      'D..AA..D',
      'D..AA..D',
      '#..PP..#',
      '#......#',
      '###DD###',
    ],
    '#292524',
  ),
  tile(
    'room-pit',
    'Pit Arena',
    'special',
    [
      '###DD###',
      '#......#',
      '#.OOOO.#',
      'D.OOOO.D',
      'D.OOOO.D',
      '#.OOOO.#',
      '#......#',
      '###DD###',
    ],
    '#0b1020',
  ),
]

export const tilesById: Record<string, TileDef> = Object.fromEntries(
  TILES.map((t) => [t.id, t]),
)

export function normalizeRotation(value: number): RotationDeg {
  const normalized = ((Math.round(value / 90) * 90) % 360 + 360) % 360
  if (normalized === 90 || normalized === 180 || normalized === 270) {
    return normalized
  }
  return 0
}

function rotateCellsClockwise(cells: TileCell[][]) {
  const originalHeight = cells.length
  const originalWidth = cells[0]?.length ?? 0
  const rotated: TileCell[][] = Array.from({ length: originalWidth }, () =>
    Array.from({ length: originalHeight }, () => 'void' as TileCell),
  )

  for (let y = 0; y < originalHeight; y += 1) {
    for (let x = 0; x < originalWidth; x += 1) {
      rotated[x][originalHeight - 1 - y] = cells[y][x]
    }
  }
  return rotated
}

export function getTileShape(tile: TileDef, rotation: number): TileShape {
  const normalized = normalizeRotation(rotation)
  let cells = tile.cells
  if (normalized === 90) {
    cells = rotateCellsClockwise(cells)
  } else if (normalized === 180) {
    cells = rotateCellsClockwise(rotateCellsClockwise(cells))
  } else if (normalized === 270) {
    cells = rotateCellsClockwise(rotateCellsClockwise(rotateCellsClockwise(cells)))
  }
  return {
    width: cells[0]?.length ?? 0,
    height: cells.length,
    cells,
  }
}
