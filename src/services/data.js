// No silent fallback to demo accounts when the live backend is unavailable.
import { createSupabaseProvider } from './supabaseProvider'

const requestedMode = String(import.meta.env.VITE_DATA_MODE || 'supabase').trim().toLowerCase()

export const data = requestedMode === 'local'
  ? (await import('./localProvider')).createLocalProvider()
  : createSupabaseProvider()
export const DATA_MODE = data.mode
