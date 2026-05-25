import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
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
const MIN_ZOOM = 0.5
const MAX_ZOOM = 2
const ZOOM_STEP = 0.1

function getSnappedGridCell(
  activeRect: ClientRect | null | undefined,
  gridRect: ClientRect,
  tile: TileDef,
  zoom: number,
): { x: number; y: number } | null {
  if (!activeRect) return null

  const offsetX = activeRect.left - gridRect.left
  const offsetY = activeRect.top - gridRect.top

  let cellX = Math.round(offsetX / (CELL_SIZE_PX * zoom))
  let cellY = Math.round(offsetY / (CELL_SIZE_PX * zoom))

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
  const [selectedPlacedId, setSelectedPlacedId] = useState<string | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [zoom, setZoom] = useState(1)
  const canvasRef = useRef<HTMLElement | null>(null)
  const panRef = useRef<{
    pointerId: number | null
    startX: number
    startY: number
    startScrollLeft: number
    startScrollTop: number
  }>({
    pointerId: null,
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    startScrollTop: 0,
  })

  // Require a small drag distance so a click on the tile button doesn't
  // immediately try to start a drag-and-place gesture.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  const applyZoom = (nextZoom: number, clientX?: number, clientY?: number) => {
    const canvas = canvasRef.current
    const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom))
    if (!canvas || clampedZoom === zoom) {
      setZoom(clampedZoom)
      return
    }

    const rect = canvas.getBoundingClientRect()
    const focusClientX = clientX ?? rect.left + rect.width / 2
    const focusClientY = clientY ?? rect.top + rect.height / 2
    const focusOffsetX = focusClientX - rect.left
    const focusOffsetY = focusClientY - rect.top

    const worldX = (canvas.scrollLeft + focusOffsetX) / zoom
    const worldY = (canvas.scrollTop + focusOffsetY) / zoom

    setZoom(clampedZoom)

    requestAnimationFrame(() => {
      canvas.scrollLeft = worldX * clampedZoom - focusOffsetX
      canvas.scrollTop = worldY * clampedZoom - focusOffsetY
    })
  }

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

    const snapped = getSnappedGridCell(translatedRect, over.rect, tile, zoom)
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
    if (source === 'placed' && placedId) {
      setSelectedPlacedId(placedId)
    }
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

  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('.placed-tile, .draggable-tile, button')) return

    const canvas = canvasRef.current
    if (!canvas) return

    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: canvas.scrollLeft,
      startScrollTop: canvas.scrollTop,
    }
    canvas.setPointerCapture(event.pointerId)
    setIsPanning(true)
    event.preventDefault()
  }

  const handleCanvasPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (panRef.current.pointerId !== event.pointerId) return
    const canvas = canvasRef.current
    if (!canvas) return

    const dx = event.clientX - panRef.current.startX
    const dy = event.clientY - panRef.current.startY
    canvas.scrollLeft = panRef.current.startScrollLeft - dx
    canvas.scrollTop = panRef.current.startScrollTop - dy
  }

  const endPan = (event: ReactPointerEvent<HTMLElement>) => {
    if (panRef.current.pointerId !== event.pointerId) return
    const canvas = canvasRef.current
    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId)
    }
    panRef.current.pointerId = null
    setIsPanning(false)
  }

  const handleCanvasWheel = (event: ReactWheelEvent<HTMLElement>) => {
    if (!(event.ctrlKey || event.metaKey)) return
    event.preventDefault()
    const direction = event.deltaY < 0 ? 1 : -1
    applyZoom(zoom + direction * ZOOM_STEP, event.clientX, event.clientY)
  }

  useEffect(() => {
    if (!selectedPlacedId) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Backspace') return
      setPlaced((prev) => prev.filter((tile) => tile.id !== selectedPlacedId))
      setSelectedPlacedId(null)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedPlacedId])

  const gridPixelWidth = GRID_COLS * CELL_SIZE_PX
  const gridPixelHeight = GRID_ROWS * CELL_SIZE_PX

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
        <main
          ref={canvasRef}
          className={`canvas ${isPanning ? 'canvas-panning' : ''}`.trim()}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={endPan}
          onPointerCancel={endPan}
          onWheel={handleCanvasWheel}
        >
          <div className="zoom-controls">
            <button
              type="button"
              className="zoom-button"
              onClick={() => applyZoom(zoom - ZOOM_STEP)}
              title="Zoom out"
              aria-label="Zoom out"
            >
              -
            </button>
            <span className="zoom-label">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              className="zoom-button"
              onClick={() => applyZoom(zoom + ZOOM_STEP)}
              title="Zoom in"
              aria-label="Zoom in"
            >
              +
            </button>
          </div>

          <div
            className="grid-stage"
            style={{ width: gridPixelWidth * zoom, height: gridPixelHeight * zoom }}
          >
            <div
              className="grid-scale-layer"
              style={{
                width: gridPixelWidth,
                height: gridPixelHeight,
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
              }}
            >
              <Grid
                onPointerDown={(event) => {
                  if ((event.target as HTMLElement).classList.contains('grid-canvas')) {
                    setSelectedPlacedId(null)
                  }
                }}
              >
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
                    selected={selectedPlacedId === p.id}
                    onSelect={setSelectedPlacedId}
                  />
                ))}
              </Grid>
            </div>
          </div>
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
                width: tile.width * CELL_SIZE_PX * zoom,
                height: tile.height * CELL_SIZE_PX * zoom,
                background: tile.color,
              }}
            />
          )
        })()}
      </DragOverlay>
    </DndContext>
  )
}
