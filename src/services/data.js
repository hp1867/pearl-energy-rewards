// Single entry point. VITE_DATA_MODE=local explicitly selects the reversible
// client-demo database even when Firebase credentials remain configured.
import { isFirebaseConfigured } from '../firebase/config'
import { createLocalProvider } from './localProvider'
import { createFirebaseProvider } from './firebaseProvider'

const requestedMode = String(import.meta.env.VITE_DATA_MODE || 'auto').trim().toLowerCase()
const useFirebase = requestedMode !== 'local' && isFirebaseConfigured

export const data = useFirebase ? createFirebaseProvider() : createLocalProvider()
export const DATA_MODE = data.mode // 'firebase' | 'local'
