export type Placed = {
  id: string
  tileId: string
  x: number
  y: number
  rotation?: number
}

export type SharePayload = {
  v: 1
  placed: Placed[]
  zoom: number
  scroll: { left: number; top: number }
}

export const SHARE_QUERY_KEY = 'share'
const LEGACY_QUERY_KEY = 'map'
export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 2

export function createShareId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  const randomBytes = crypto.getRandomValues(new Uint8Array(8))
  for (let i = 0; i < randomBytes.length; i += 1) {
    id += chars[randomBytes[i] % chars.length]
  }
  return id
}

function toUrlSafeBase64(input: string) {
  const bytes = new TextEncoder().encode(input)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromUrlSafeBase64(input: string) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function isValidPlaced(value: unknown): value is Placed {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<Placed>
  return (
    typeof item.id === 'string' &&
    typeof item.tileId === 'string' &&
    Number.isInteger(item.x) &&
    Number.isInteger(item.y) &&
    (item.rotation === undefined || Number.isInteger(item.rotation))
  )
}

export function decodeLegacyPayload(encoded: string, validTileIds: Set<string>) {
  try {
    const decoded = fromUrlSafeBase64(encoded)
    const parsed = JSON.parse(decoded) as Partial<SharePayload>
    if (parsed.v !== 1) return null
    if (!Array.isArray(parsed.placed)) return null
    if (typeof parsed.zoom !== 'number' || !Number.isFinite(parsed.zoom)) return null
    if (!parsed.scroll || typeof parsed.scroll !== 'object') return null
    if (
      typeof parsed.scroll.left !== 'number' ||
      typeof parsed.scroll.top !== 'number' ||
      !Number.isFinite(parsed.scroll.left) ||
      !Number.isFinite(parsed.scroll.top)
    ) {
      return null
    }

    const filteredPlaced = parsed.placed.filter(
      (item): item is Placed =>
        isValidPlaced(item) && validTileIds.has(item.tileId),
    )

    return {
      v: 1 as const,
      placed: filteredPlaced,
      zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, parsed.zoom)),
      scroll: {
        left: Math.max(0, parsed.scroll.left),
        top: Math.max(0, parsed.scroll.top),
      },
    }
  } catch {
    return null
  }
}

export function encodeLegacyPayload(payload: SharePayload) {
  return toUrlSafeBase64(JSON.stringify(payload))
}

export function getLegacyQueryKey() {
  return LEGACY_QUERY_KEY
}
