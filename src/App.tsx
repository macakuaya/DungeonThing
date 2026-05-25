import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type ClientRect,
  type DragCancelEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { Grid, GRID_DROPPABLE_ID } from './components/Grid'
import { Sidebar } from './components/Sidebar'
import { PlacedTile } from './components/PlacedTile'
import {
  CELL_SIZE_PX,
  GRID_COLS,
  GRID_ROWS,
  type TileDef,
  tilesById,
} from './tiles'
import './App.css'

type Placed = { id: string; tileId: string; x: number; y: number }
type DragSource = 'sidebar' | 'placed'
type ActiveDrag = { tileId: string; source: DragSource; placedId?: string }
type DragPreview = { tileId: string; x: number; y: number; valid: boolean }

function getSnappedGridCell(
  activeRect: ClientRect | null | undefined,
  gridRect: ClientRect,
  tile: TileDef,
): { x: number; y: number } | null {
  if (!activeRect) return null

  const offsetX = activeRect.left - gridRect.left
  const offsetY = activeRect.top - gridRect.top

  let cellX = Math.round(offsetX / CELL_SIZE_PX)
  let cellY = Math.round(offsetY / CELL_SIZE_PX)

  cellX = Math.max(0, Math.min(GRID_COLS - tile.width, cellX))
  cellY = Math.max(0, Math.min(GRID_ROWS - tile.height, cellY))

  return { x: cellX, y: cellY }
}

function tilesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

function canPlaceAt(
  placedTiles: Placed[],
  tile: TileDef,
  x: number,
  y: number,
  ignorePlacedId?: string,
) {
  return !placedTiles.some((existing) => {
    if (ignorePlacedId && existing.id === ignorePlacedId) return false
    const existingTile = tilesById[existing.tileId]
    if (!existingTile) return false
    return tilesOverlap(
      { x, y, width: tile.width, height: tile.height },
      {
        x: existing.x,
        y: existing.y,
        width: existingTile.width,
        height: existingTile.height,
      },
    )
  })
}

export default function App() {
  const [placed, setPlaced] = useState<Placed[]>([])
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null)
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null)

  // Require a small drag distance so a click on the tile button doesn't
  // immediately try to start a drag-and-place gesture.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  const updateDragPreview = (
    tileId: string,
    source: DragSource,
    placedId: string | undefined,
    over: DragMoveEvent['over'] | DragEndEvent['over'],
    translatedRect: ClientRect | null | undefined,
  ) => {
    if (!over || over.id !== GRID_DROPPABLE_ID) {
      setDragPreview(null)
      return null
    }

    const tile = tilesById[tileId]
    if (!tile) {
      setDragPreview(null)
      return null
    }

    const snapped = getSnappedGridCell(translatedRect, over.rect, tile)
    if (!snapped) {
      setDragPreview(null)
      return null
    }

    const nextPreview = {
      tileId,
      x: snapped.x,
      y: snapped.y,
      valid: canPlaceAt(
        placed,
        tile,
        snapped.x,
        snapped.y,
        source === 'placed' ? placedId : undefined,
      ),
    }
    setDragPreview(nextPreview)
    return nextPreview
  }

  const handleDragStart = (event: DragStartEvent) => {
    const tileId = event.active.data.current?.tileId as string | undefined
    const source = event.active.data.current?.source as DragSource | undefined
    const placedId = event.active.data.current?.placedId as string | undefined
    if (!tileId || !source) return

    setActiveDrag({ tileId, source, placedId })
  }

  const handleDragMove = (event: DragMoveEvent) => {
    if (!activeDrag) return
    updateDragPreview(
      activeDrag.tileId,
      activeDrag.source,
      activeDrag.placedId,
      event.over,
      event.active.rect.current.translated,
    )
  }

  const handleDragCancel = (_event: DragCancelEvent) => {
    setActiveDrag(null)
    setDragPreview(null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    const tileId = activeDrag?.tileId ?? (active.data.current?.tileId as string | undefined)
    if (!tileId) {
      setActiveDrag(null)
      setDragPreview(null)
      return
    }

    const tile = tilesById[tileId]
    if (!tile) {
      setActiveDrag(null)
      setDragPreview(null)
      return
    }

    const preview =
      dragPreview ??
      updateDragPreview(
        tileId,
        activeDrag?.source ?? 'sidebar',
        activeDrag?.placedId,
        over,
        active.rect.current.translated,
      )
    if (preview && preview.valid) {
      if (activeDrag?.source === 'placed' && activeDrag.placedId) {
        setPlaced((prev) =>
          prev.map((item) =>
            item.id === activeDrag.placedId
              ? { ...item, x: preview.x, y: preview.y }
              : item,
          ),
        )
      } else {
        setPlaced((prev) => [
          ...prev,
          {
            id: `${tileId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            tileId,
            x: preview.x,
            y: preview.y,
          },
        ])
      }
    }

    setActiveDrag(null)
    setDragPreview(null)
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
    >
      <div className="app">
        <Sidebar />
        <main className="canvas">
          <Grid>
            {dragPreview && (() => {
              const tile = tilesById[dragPreview.tileId]
              if (!tile) return null
              return (
                <div
                  className={`landing-preview ${dragPreview.valid ? '' : 'landing-preview-blocked'}`.trim()}
                  style={{
                    position: 'absolute',
                    left: dragPreview.x * CELL_SIZE_PX,
                    top: dragPreview.y * CELL_SIZE_PX,
                    width: tile.width * CELL_SIZE_PX,
                    height: tile.height * CELL_SIZE_PX,
                    background: tile.color,
                  }}
                />
              )
            })()}
            {placed.map((p) => (
              <PlacedTile
                key={p.id}
                placedId={p.id}
                tileId={p.tileId}
                x={p.x}
                y={p.y}
              />
            ))}
          </Grid>
        </main>
      </div>
      <DragOverlay dropAnimation={null}>
        {activeDrag && (() => {
          const tile = tilesById[activeDrag.tileId]
          if (!tile) return null
          return (
            <div
              className="drag-overlay-tile"
              style={{
                width: tile.width * CELL_SIZE_PX,
                height: tile.height * CELL_SIZE_PX,
                background: tile.color,
              }}
            />
          )
        })()}
      </DragOverlay>
    </DndContext>
  )
}
