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
import { toBlob } from 'html-to-image'
import { Grid } from './components/Grid'
import { Sidebar } from './components/Sidebar'
import { PlacedTile } from './components/PlacedTile'
import { TileSprite } from './components/TileSprite'
import {
  CELL_SIZE_PX,
  GRID_COLS,
  GRID_ROWS,
  getTileShape,
  normalizeRotation,
  type TileCell,
  type TileDef,
  tilesById,
} from './tiles'
import {
  MAX_ZOOM,
  MIN_ZOOM,
  SHARE_QUERY_KEY,
  createShareId,
  decodeLegacyPayload,
  getLegacyQueryKey,
  type Placed,
  type SharePayload,
} from './lib/share'
import {
  createSharedMap,
  fetchSharedMap,
  getShareCardBaseUrl,
  hasSupabaseConfig,
  uploadSharePreview,
} from './lib/supabase'
import './App.css'

type DragSource = 'sidebar' | 'placed'
type ActiveDrag = {
  tileId: string
  rotation: number
  source: DragSource
  placedId?: string
}
type DragPreview = {
  tileId: string
  rotation: number
  x: number
  y: number
  valid: boolean
}
const ZOOM_STEP = 0.1
type TrackpadGestureEvent = Event & {
  scale: number
  clientX: number
  clientY: number
  preventDefault: () => void
}

function getSnappedGridCell(
  activeRect: ClientRect | null | undefined,
  canvasRect: DOMRect,
  scrollLeft: number,
  scrollTop: number,
  tileWidth: number,
  tileHeight: number,
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

  cellX = Math.max(0, Math.min(maxCols - tileWidth, cellX))
  cellY = Math.max(0, Math.min(maxRows - tileHeight, cellY))

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

function isOccupiedCell(cell: TileCell) {
  return cell !== 'void'
}

function getOccupiedCells(cells: TileCell[][], atX: number, atY: number) {
  const occupied: string[] = []
  for (let y = 0; y < cells.length; y += 1) {
    for (let x = 0; x < (cells[y]?.length ?? 0); x += 1) {
      if (!isOccupiedCell(cells[y][x])) continue
      occupied.push(`${atX + x},${atY + y}`)
    }
  }
  return occupied
}

function tilesOverlapByShape(
  aShape: { width: number; height: number; cells: TileCell[][] },
  aX: number,
  aY: number,
  bShape: { width: number; height: number; cells: TileCell[][] },
  bX: number,
  bY: number,
) {
  // Fast-reject via bounding rectangles first.
  if (
    !tilesOverlap(
      { x: aX, y: aY, width: aShape.width, height: aShape.height },
      { x: bX, y: bY, width: bShape.width, height: bShape.height },
    )
  ) {
    return false
  }

  const occupiedB = new Set(getOccupiedCells(bShape.cells, bX, bY))
  for (const cell of getOccupiedCells(aShape.cells, aX, aY)) {
    if (occupiedB.has(cell)) return true
  }
  return false
}

function canPlaceAt(
  placedTiles: Placed[],
  tile: TileDef,
  rotation: number,
  x: number,
  y: number,
  ignorePlacedId?: string,
) {
  const shape = getTileShape(tile, rotation)
  return !placedTiles.some((existing) => {
    if (ignorePlacedId && existing.id === ignorePlacedId) return false
    const existingTile = tilesById[existing.tileId]
    if (!existingTile) return false
    const existingShape = getTileShape(existingTile, existing.rotation ?? 0)
    return tilesOverlapByShape(
      shape,
      x,
      y,
      existingShape,
      existing.x,
      existing.y,
    )
  })
}

function findNearestAvailableCell(
  startX: number,
  startY: number,
  placedTiles: Placed[],
  tile: TileDef,
  rotation: number,
  maxCols: number,
  maxRows: number,
  ignorePlacedId?: string,
) {
  const shape = getTileShape(tile, rotation)
  const maxRadius = Math.max(maxCols, maxRows)

  for (let radius = 0; radius <= maxRadius; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (radius > 0 && Math.abs(dx) !== radius && Math.abs(dy) !== radius) {
          continue
        }

        const x = startX + dx
        const y = startY + dy
        if (
          x < 0 ||
          y < 0 ||
          x > maxCols - shape.width ||
          y > maxRows - shape.height
        ) {
          continue
        }

        if (canPlaceAt(placedTiles, tile, rotation, x, y, ignorePlacedId)) {
          return { x, y }
        }
      }
    }
  }

  return null
}

function getFittedViewForPlaced(
  canvas: HTMLElement,
  placedTiles: Placed[],
): { zoom: number; scrollLeft: number; scrollTop: number } | null {
  if (placedTiles.length === 0) return null

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const item of placedTiles) {
    const tile = tilesById[item.tileId]
    if (!tile) continue
    const shape = getTileShape(tile, item.rotation ?? 0)
    for (let y = 0; y < shape.height; y += 1) {
      for (let x = 0; x < shape.width; x += 1) {
        if (!isOccupiedCell(shape.cells[y][x])) continue
        const worldCellX = item.x + x
        const worldCellY = item.y + y
        minX = Math.min(minX, worldCellX)
        minY = Math.min(minY, worldCellY)
        maxX = Math.max(maxX, worldCellX + 1)
        maxY = Math.max(maxY, worldCellY + 1)
      }
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null

  const paddingPx = CELL_SIZE_PX * 2
  const boundsWidth = Math.max(CELL_SIZE_PX, (maxX - minX) * CELL_SIZE_PX)
  const boundsHeight = Math.max(CELL_SIZE_PX, (maxY - minY) * CELL_SIZE_PX)

  const availableWidth = Math.max(40, canvas.clientWidth - paddingPx * 2)
  const availableHeight = Math.max(40, canvas.clientHeight - paddingPx * 2)
  const fitZoom = Math.min(
    MAX_ZOOM,
    Math.max(
      MIN_ZOOM,
      Math.min(availableWidth / boundsWidth, availableHeight / boundsHeight),
    ),
  )

  const centerWorldX = ((minX + maxX) / 2) * CELL_SIZE_PX
  const centerWorldY = ((minY + maxY) / 2) * CELL_SIZE_PX

  const scrollLeft = Math.max(0, centerWorldX * fitZoom - canvas.clientWidth / 2)
  const scrollTop = Math.max(0, centerWorldY * fitZoom - canvas.clientHeight / 2)

  return { zoom: fitZoom, scrollLeft, scrollTop }
}

export default function App() {
  const [placed, setPlaced] = useState<Placed[]>([])
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null)
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null)
  const [selectedPlacedId, setSelectedPlacedId] = useState<string | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [shareStatus, setShareStatus] = useState<
    'idle' | 'sharing' | 'copied' | 'error' | 'setup'
  >('idle')
  const canvasRef = useRef<HTMLElement | null>(null)
  const pendingHydratedScrollRef = useRef<{ left: number; top: number } | null>(
    null,
  )
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
    const shape = getTileShape(tile, item.rotation ?? 0)
    return Math.max(maxCol, item.x + shape.width)
  }, 0)
  const maxPlacedRow = placed.reduce((maxRow, item) => {
    const tile = tilesById[item.tileId]
    if (!tile) return maxRow
    const shape = getTileShape(tile, item.rotation ?? 0)
    return Math.max(maxRow, item.y + shape.height)
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
    rotation: number,
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
    const shape = getTileShape(tile, rotation)

    const snapped = getSnappedGridCell(
      translatedRect,
      canvas.getBoundingClientRect(),
      canvas.scrollLeft,
      canvas.scrollTop,
      shape.width,
      shape.height,
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
      rotation,
      x: snapped.x,
      y: snapped.y,
      valid: canPlaceAt(
        placed,
        tile,
        rotation,
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
    const rotation = normalizeRotation(
      (event.active.data.current?.rotation as number | undefined) ?? 0,
    )
    if (!tileId || !source) return

    setActiveDrag({ tileId, rotation, source, placedId })
    if (source === 'placed' && placedId) {
      setSelectedPlacedId(placedId)
    }
  }

  const handleDragMove = (event: DragMoveEvent) => {
    if (!activeDrag) return
    updateDragPreview(
      activeDrag.tileId,
      activeDrag.rotation,
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
    const rotation = normalizeRotation(
      activeDrag?.rotation ??
        ((active.data.current?.rotation as number | undefined) ?? 0),
    )
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
        rotation,
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
            rotation,
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
              rotation,
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

  const handleShare = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!hasSupabaseConfig) {
      setShareStatus('setup')
      return
    }

    setShareStatus('sharing')
    const fittedView = getFittedViewForPlaced(canvas, placed)
    const payload: SharePayload = {
      v: 1,
      placed,
      zoom: fittedView?.zoom ?? zoom,
      scroll: {
        left: fittedView?.scrollLeft ?? canvas.scrollLeft,
        top: fittedView?.scrollTop ?? canvas.scrollTop,
      },
    }

    try {
      const shareId = createShareId()
      const previewBlob =
        (await toBlob(canvas, {
          cacheBust: true,
          pixelRatio: 1,
        })) ?? undefined
      if (!previewBlob) {
        throw new Error('Could not generate preview image')
      }

      const previewPath = `${shareId}.png`
      await uploadSharePreview(previewPath, previewBlob)
      await createSharedMap({
        id: shareId,
        payload,
        preview_path: previewPath,
      })

      const shareCardBase = getShareCardBaseUrl()
      if (!shareCardBase) throw new Error('Share URL is not configured')
      const shareUrl = `${shareCardBase.replace(/\/$/, '')}/${shareId}`

      await navigator.clipboard.writeText(shareUrl)
      setShareStatus('copied')
    } catch {
      setShareStatus('error')
    }
  }

  useEffect(() => {
    if (!selectedPlacedId) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Backspace') {
        setPlaced((prev) => prev.filter((tile) => tile.id !== selectedPlacedId))
        setSelectedPlacedId(null)
        return
      }

      if (event.code !== 'Space') return
      event.preventDefault()

      setPlaced((prev) => {
        const current = prev.find((tile) => tile.id === selectedPlacedId)
        if (!current) return prev
        const tileDef = tilesById[current.tileId]
        if (!tileDef) return prev

        const nextRotation = normalizeRotation((current.rotation ?? 0) + 90)
        const nextShape = getTileShape(tileDef, nextRotation)
        const clampedX = Math.max(0, Math.min(contentCols - nextShape.width, current.x))
        const clampedY = Math.max(0, Math.min(contentRows - nextShape.height, current.y))

        let target = { x: clampedX, y: clampedY }
        if (
          !canPlaceAt(
            prev,
            tileDef,
            nextRotation,
            target.x,
            target.y,
            current.id,
          )
        ) {
          const fallback = findNearestAvailableCell(
            target.x,
            target.y,
            prev,
            tileDef,
            nextRotation,
            contentCols,
            contentRows,
            current.id,
          )
          if (!fallback) return prev
          target = fallback
        }

        return prev.map((item) =>
          item.id === current.id
            ? { ...item, rotation: nextRotation, x: target.x, y: target.y }
            : item,
        )
      })
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [contentCols, contentRows, selectedPlacedId])

  useEffect(() => {
    const search = new URLSearchParams(window.location.search)
    const shareId = search.get(SHARE_QUERY_KEY)
    const legacyEncoded = search.get(getLegacyQueryKey())
    const validTileIds = new Set(Object.keys(tilesById))

    if (legacyEncoded) {
      const legacyPayload = decodeLegacyPayload(legacyEncoded, validTileIds)
      if (legacyPayload) {
        setPlaced(legacyPayload.placed)
        setZoom(legacyPayload.zoom)
        pendingHydratedScrollRef.current = legacyPayload.scroll
      }
    }

    if (!shareId || !hasSupabaseConfig) return

    fetchSharedMap(shareId)
      .then((payload) => {
        if (!payload) return
        const filteredPlaced = payload.placed.filter((tile) =>
          validTileIds.has(tile.tileId),
        )
        setPlaced(filteredPlaced)
        setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, payload.zoom)))
        pendingHydratedScrollRef.current = {
          left: Math.max(0, payload.scroll.left),
          top: Math.max(0, payload.scroll.top),
        }
      })
      .catch(() => {
        // If the shared id is missing/invalid we keep the current map empty.
      })
  }, [])

  useEffect(() => {
    if (!pendingHydratedScrollRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return

    const pending = pendingHydratedScrollRef.current
    requestAnimationFrame(() => {
      if (!canvasRef.current) return
      canvasRef.current.scrollLeft = pending.left
      canvasRef.current.scrollTop = pending.top
      pendingHydratedScrollRef.current = null
    })
  }, [zoom, placed.length])

  useEffect(() => {
    if (!['copied', 'error', 'setup'].includes(shareStatus)) return
    const timeout = window.setTimeout(() => {
      setShareStatus('idle')
    }, 1700)
    return () => window.clearTimeout(timeout)
  }, [shareStatus])

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
            <button
              type="button"
              className="share-button"
              onClick={handleShare}
              title="Copy a link with current map and view"
              aria-label="Share map"
              disabled={shareStatus === 'sharing'}
            >
              {shareStatus === 'sharing' ? 'Sharing...' : 'Share'}
            </button>
          </div>
          {shareStatus === 'sharing' && (
            <div
              className="share-toast share-toast-static"
              role="status"
              aria-live="polite"
            >
              Creating link...
            </div>
          )}
          {shareStatus === 'copied' && (
            <div className="share-toast" role="status" aria-live="polite">
              Copied link
            </div>
          )}
          {shareStatus === 'error' && (
            <div className="share-toast share-toast-error" role="alert">
              Copy failed
            </div>
          )}
          {shareStatus === 'setup' && (
            <div className="share-toast share-toast-error" role="alert">
              Add Supabase env vars first
            </div>
          )}

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
                    const shape = getTileShape(tile, dragPreview.rotation)
                    return (
                      <div
                        className={`landing-preview ${dragPreview.valid ? '' : 'landing-preview-blocked'}`.trim()}
                        style={{
                          position: 'absolute',
                          left: dragPreview.x * CELL_SIZE_PX,
                          top: dragPreview.y * CELL_SIZE_PX,
                          width: shape.width * CELL_SIZE_PX,
                          height: shape.height * CELL_SIZE_PX,
                        background: tile.tint,
                        }}
                      />
                    )
                  })()}
                  {placed.map((p) => (
                    <PlacedTile
                      key={p.id}
                      placedId={p.id}
                      tileId={p.tileId}
                      rotation={p.rotation ?? 0}
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
          const shape = getTileShape(tile, activeDrag.rotation)
          return (
            <TileSprite
              tile={tile}
              rotation={activeDrag.rotation}
              cellSize={CELL_SIZE_PX * zoom}
              className="drag-overlay-tile"
              style={{
                width: shape.width * CELL_SIZE_PX * zoom,
                height: shape.height * CELL_SIZE_PX * zoom,
                opacity: 0.75,
              }}
            />
          )
        })()}
      </DragOverlay>
    </DndContext>
  )
}
