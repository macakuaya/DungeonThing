import { useState } from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { Grid, GRID_DROPPABLE_ID } from './components/Grid'
import { Sidebar } from './components/Sidebar'
import { PlacedTile } from './components/PlacedTile'
import {
  CELL_SIZE_PX,
  GRID_COLS,
  GRID_ROWS,
  tilesById,
} from './tiles'
import './App.css'

type Placed = { id: string; tileId: string; x: number; y: number }

export default function App() {
  const [placed, setPlaced] = useState<Placed[]>([])

  // Require a small drag distance so a click on the tile button doesn't
  // immediately try to start a drag-and-place gesture.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || over.id !== GRID_DROPPABLE_ID) return

    const tileId = active.data.current?.tileId as string | undefined
    if (!tileId) return
    const tile = tilesById[tileId]
    if (!tile) return

    // Where the dragged element ended up, and where the grid sits.
    const activeRect = active.rect.current.translated
    const gridRect = over.rect
    if (!activeRect) return

    // Pixel offset of the tile's top-left relative to the grid's top-left.
    const offsetX = activeRect.left - gridRect.left
    const offsetY = activeRect.top - gridRect.top

    // Snap to nearest cell (top-left corner anchor).
    let cellX = Math.round(offsetX / CELL_SIZE_PX)
    let cellY = Math.round(offsetY / CELL_SIZE_PX)

    // Clamp so the tile stays inside the grid.
    cellX = Math.max(0, Math.min(GRID_COLS - tile.width, cellX))
    cellY = Math.max(0, Math.min(GRID_ROWS - tile.height, cellY))

    setPlaced((prev) => [
      ...prev,
      {
        id: `${tileId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        tileId,
        x: cellX,
        y: cellY,
      },
    ])
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="app">
        <Sidebar />
        <main className="canvas">
          <Grid>
            {placed.map((p) => (
              <PlacedTile key={p.id} tileId={p.tileId} x={p.x} y={p.y} />
            ))}
          </Grid>
        </main>
      </div>
    </DndContext>
  )
}
