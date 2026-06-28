import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error('Missing Firebase credentials: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY');
  process.exit(1);
}

const app = getApps().length === 0 ? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);

async function createAdminUser() {
  const email = 'admin@onyx.com';
  const password = 'admin123';
  const nome = 'Administrador';

  try {
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(email);
      console.log(`Admin user already exists: ${userRecord.uid}`);
    } catch (e: any) {
      if (e.code === 'auth/user-not-found') {
        userRecord = await auth.createUser({ email, password, displayName: nome, emailVerified: true });
        console.log(`Admin user created: ${userRecord.uid}`);
      } else {
        throw e;
      }
    }

    const userDoc = await db.collection('usuarios').doc(userRecord.uid).get();
    if (!userDoc.exists) {
      await db.collection('usuarios').doc(userRecord.uid).set({
        nome, email, role: 'admin', ativo: true, createdAt: Timestamp.now(), updatedAt: Timestamp.now()
      });
      console.log('Admin user document created in Firestore');
    } else {
      console.log('Admin user document already exists in Firestore');
    }

    console.log('Firebase initialization complete!');
    console.log('Admin credentials:');
    console.log('  Email: admin@onyx.com');
    console.log('  Password: admin123');
  } catch (error: any) {
    console.error('Error creating admin user:', error);
    process.exit(1);
  }
}

createAdminUser();