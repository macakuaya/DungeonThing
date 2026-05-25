import { createClient } from '@supabase/supabase-js'
import type { SharePayload } from './share'

type SharedMapRow = {
  id: string
  payload: SharePayload
  preview_path: string
  created_at?: string
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null

export async function createSharedMap(row: SharedMapRow) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { error } = await supabase.from('shared_maps').insert(row)
  if (error) throw error
}

export async function uploadSharePreview(path: string, blob: Blob) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { error } = await supabase.storage
    .from('share-previews')
    .upload(path, blob, { upsert: true, contentType: 'image/png' })
  if (error) throw error
}

export async function fetchSharedMap(shareId: string) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase
    .from('shared_maps')
    .select('payload')
    .eq('id', shareId)
    .single()
  if (error) throw error
  return data?.payload as SharePayload
}

export function getShareCardBaseUrl() {
  const explicit = import.meta.env.VITE_SHARE_CARD_URL as string | undefined
  if (explicit) return explicit
  if (!supabaseUrl) return null
  return `${supabaseUrl}/functions/v1/share-card`
}

export function getPublicAppUrl() {
  const explicit = import.meta.env.VITE_PUBLIC_APP_URL as string | undefined
  if (explicit) return explicit
  return `${window.location.origin}${window.location.pathname}`
}
