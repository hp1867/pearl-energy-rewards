// Central switchboard for every external integration.
// Each one reads its key from .env and exposes a `ready` flag.
// Flags indicate configuration only, not a successful live health check.
// Missing credentials never enable demo data automatically.
import { isSupabaseConfigured } from '../supabase/client'

const env = import.meta.env
const has = (v) => Boolean(v && !String(v).startsWith('your-') && v !== '')

export const integrations = {
  supabase: {
    ready: isSupabaseConfigured,
    label: 'Supabase Auth + PostgreSQL',
  },
  maps: {
    key: env.VITE_GOOGLE_MAPS_API_KEY,
    ready: has(env.VITE_GOOGLE_MAPS_API_KEY),
    label: 'Google Maps',
  },
  push: {
    vapidKey: env.VITE_WEB_PUSH_PUBLIC_KEY,
    ready: isSupabaseConfigured && has(env.VITE_WEB_PUSH_PUBLIC_KEY),
    label: 'Web Push notifications',
  },
  wallet: {
    apiUrl: env.VITE_WALLET_API_URL,
    ready: has(env.VITE_WALLET_API_URL),
    label: 'Apple / Google / Samsung Wallet passes',
  },
}

// Overall launch readiness summary (used by the admin dashboard).
export const readiness = () => Object.entries(integrations).map(([id, v]) => ({ id, label: v.label, ready: v.ready }))
