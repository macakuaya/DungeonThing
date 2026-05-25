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
import { Grid } from './components/Grid'
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
type TrackpadGestureEvent = Event & {
  scale: number
  clientX: number
  clientY: number
  preventDefault: () => void
}
const MIN_ZOOM = 0.5
const MAX_ZOOM = 2
const ZOOM_STEP = 0.1

function getSnappedGridCell(
  activeRect: ClientRect | null | undefined,
  canvasRect: DOMRect,
  scrollLeft: number,
  scrollTop: number,
  tile: TileDef,
  zoom: number,
  maxCols: number,
  maxRows: number,
): { x: number; y: number } | null {
  if (!activeRect) return null

  const isInsideCanvas =
    activeRect.right >= canvasRect.left &&
    activeRect.left <= canvasRect.right &&
    activeRect.bottom >= canvasRect.top &&
    activeRect.top <= canvasRect.bottom
  if (!isInsideCanvas) return null

  const offsetX = activeRect.left - canvasRect.left + scrollLeft
  const offsetY = activeRect.top - canvasRect.top + scrollTop

  let cellX = Math.round(offsetX / (CELL_SIZE_PX * zoom))
  let cellY = Math.round(offsetY / (CELL_SIZE_PX * zoom))

  cellX = Math.max(0, Math.min(maxCols - tile.width, cellX))
  cellY = Math.max(0, Math.min(maxRows - tile.height, cellY))

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

function findNearestAvailableCell(
  startX: number,
  startY: number,
  placedTiles: Placed[],
  tile: TileDef,
  maxCols: number,
  maxRows: number,
  ignorePlacedId?: string,
) {
  const maxRadius = Math.max(maxCols, maxRows)

  for (let radius = 0; radius <= maxRadius; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (radius > 0 && Math.abs(dx) !== radius && Math.abs(dy) !== radius) {
          continue
        }

        const x = startX + dx
        const y = startY + dy
        if (x < 0 || y < 0 || x > maxCols - tile.width || y > maxRows - tile.height) {
          continue
        }

        if (canPlaceAt(placedTiles, tile, x, y, ignorePlacedId)) {
          return { x, y }
        }
      }
    }
  }

  return null
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
  const gestureLastScaleRef = useRef(1)
  const viewportCols =
    Math.ceil((canvasRef.current?.clientWidth ?? 0) / (CELL_SIZE_PX * zoom)) + 2
  const viewportRows =
    Math.ceil((canvasRef.current?.clientHeight ?? 0) / (CELL_SIZE_PX * zoom)) + 2
  const maxPlacedCol = placed.reduce((maxCol, item) => {
    const tile = tilesById[item.tileId]
    if (!tile) return maxCol
    return Math.max(maxCol, item.x + tile.width)
  }, 0)
  const maxPlacedRow = placed.reduce((maxRow, item) => {
    const tile = tilesById[item.tileId]
    if (!tile) return maxRow
    return Math.max(maxRow, item.y + tile.height)
  }, 0)
  const contentCols = Math.max(GRID_COLS, viewportCols, maxPlacedCol + 2)
  const contentRows = Math.max(GRID_ROWS, viewportRows, maxPlacedRow + 2)

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
    _over: DragMoveEvent['over'] | DragEndEvent['over'],
    translatedRect: ClientRect | null | undefined,
  ) => {
    const canvas = canvasRef.current
    if (!canvas) {
      setDragPreview(null)
      return null
    }

    const tile = tilesById[tileId]
    if (!tile) {
      setDragPreview(null)
      return null
    }

    const snapped = getSnappedGridCell(
      translatedRect,
      canvas.getBoundingClientRect(),
      canvas.scrollLeft,
      canvas.scrollTop,
      tile,
      zoom,
      contentCols,
      contentRows,
    )
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
    if (preview) {
      const ignorePlacedId =
        activeDrag?.source === 'placed' ? activeDrag.placedId : undefined
      const resolvedCell = preview.valid
        ? { x: preview.x, y: preview.y }
        : findNearestAvailableCell(
            preview.x,
            preview.y,
            placed,
            tile,
            contentCols,
            contentRows,
            ignorePlacedId,
          )

      if (resolvedCell) {
        if (activeDrag?.source === 'placed' && activeDrag.placedId) {
          setPlaced((prev) =>
            prev.map((item) =>
              item.id === activeDrag.placedId
                ? { ...item, x: resolvedCell.x, y: resolvedCell.y }
                : item,
            ),
          )
        } else {
          setPlaced((prev) => [
            ...prev,
            {
              id: `${tileId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              tileId,
              x: resolvedCell.x,
              y: resolvedCell.y,
            },
          ])
        }
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

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Safari/trackpad pinch gestures fire these non-standard events.
    // We map gesture scale to the same zoom pipeline used by wheel/buttons.
    const onGestureStart = (event: Event) => {
      const gesture = event as TrackpadGestureEvent
      gesture.preventDefault()
      gestureLastScaleRef.current = 1
    }

    const onGestureChange = (event: Event) => {
      const gesture = event as TrackpadGestureEvent
      gesture.preventDefault()

      const prevScale = gestureLastScaleRef.current
      if (!prevScale || !Number.isFinite(gesture.scale)) return

      const stepScale = gesture.scale / prevScale
      gestureLastScaleRef.current = gesture.scale
      applyZoom(zoom * stepScale, gesture.clientX, gesture.clientY)
    }

    canvas.addEventListener('gesturestart', onGestureStart, { passive: false })
    canvas.addEventListener('gesturechange', onGestureChange, { passive: false })

    return () => {
      canvas.removeEventListener('gesturestart', onGestureStart)
      canvas.removeEventListener('gesturechange', onGestureChange)
    }
  }, [zoom])

  const gridPixelWidth = contentCols * CELL_SIZE_PX
  const gridPixelHeight = contentRows * CELL_SIZE_PX

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
        <section className="canvas-shell">
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
            <button
              type="button"
              className="zoom-reset"
              onClick={() => applyZoom(1)}
              title="Reset zoom to 100%"
              aria-label="Reset zoom to 100%"
            >
              <span className="zoom-label">{Math.round(zoom * 100)}%</span>
            </button>
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

          <main
            ref={canvasRef}
            className={`canvas ${isPanning ? 'canvas-panning' : ''}`.trim()}
            style={{
              backgroundSize: `${CELL_SIZE_PX * zoom}px ${CELL_SIZE_PX * zoom}px`,
              backgroundPosition: '-1px 0, 0 0',
            }}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={endPan}
            onPointerCancel={endPan}
            onWheel={handleCanvasWheel}
          >
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
        </section>
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
