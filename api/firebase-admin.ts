import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';

let app: App;
let db: Firestore;
let auth: Auth;

export function getAdminApp(): App {
  if (!app) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Missing Firebase Admin credentials: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY');
    }

    app = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }
  return app;
}

export function getAdminDb(): Firestore {
  if (!db) {
    getAdminApp();
    db = getFirestore();
  }
  return db;
}

export function getAdminAuth(): Auth {
  if (!auth) {
    getAdminApp();
    auth = getAuth();
  }
  return auth;
}

export { FieldValue, Timestamp };