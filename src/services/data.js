// Single entry point: pick the live Firebase provider when configured,
// otherwise the local demo provider. Same interface either way.
import { isFirebaseConfigured } from '../firebase/config'
import { createLocalProvider } from './localProvider'
import { createFirebaseProvider } from './firebaseProvider'

export const data = isFirebaseConfigured ? createFirebaseProvider() : createLocalProvider()
export const DATA_MODE = data.mode // 'firebase' | 'local'
