// Central switchboard for every external integration.
// Each one reads its key from .env and exposes a `ready` flag.
// When a key is absent the app falls back to a safe demo behaviour,
// so nothing breaks before launch — and flips on the moment you add the key.
import { isFirebaseConfigured } from '../firebase/config'

const env = import.meta.env
const has = (v) => Boolean(v && !String(v).startsWith('your-') && v !== '')

export const integrations = {
  firebase: {
    ready: isFirebaseConfigured,
    label: 'Firebase Auth + Firestore',
  },
  maps: {
    key: env.VITE_GOOGLE_MAPS_API_KEY,
    ready: has(env.VITE_GOOGLE_MAPS_API_KEY),
    label: 'Google Maps',
  },
  fcm: {
    vapidKey: env.VITE_FIREBASE_VAPID_KEY,
    ready: isFirebaseConfigured && has(env.VITE_FIREBASE_VAPID_KEY),
    label: 'Push notifications (FCM)',
  },
  wallet: {
    apiUrl: env.VITE_WALLET_API_URL,
    ready: has(env.VITE_WALLET_API_URL),
    label: 'Apple / Google / Samsung Wallet passes',
  },
}

// Overall launch readiness summary (used by the admin dashboard).
export const readiness = () => Object.entries(integrations).map(([id, v]) => ({ id, label: v.label, ready: v.ready }))
