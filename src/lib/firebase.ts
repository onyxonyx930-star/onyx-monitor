import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, connectAuthEmulator } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCgK2kLEdeZBBTdzaPpOvF3pYBZrPPV218',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'onyx-solution.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'onyx-solution',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'onyx-solution.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

console.log(`[FIREBASE] Config: apiKey=${firebaseConfig.apiKey ? 'set' : 'MISSING'}, projectId=${firebaseConfig.projectId}, authDomain=${firebaseConfig.authDomain}`);

let app: FirebaseApp;
let auth: Auth;

if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

auth = getAuth(app);

if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
  connectAuthEmulator(auth, 'http://localhost:9099');
}

export { app, auth };