import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';

/**
 * Firebase Admin SDK initialization
 *
 * Used for:
 * - Verifying Firebase Auth tokens on API requests
 * - Creating/managing user accounts programmatically
 * - NOT used for Firestore/Storage (we use PostgreSQL + Wasabi)
 *
 * Environment variables required:
 * - FIREBASE_PROJECT_ID
 * - FIREBASE_CLIENT_EMAIL
 * - FIREBASE_PRIVATE_KEY (PEM format, with \n escaped)
 */

let app: App;
let auth: Auth;

export function initFirebaseAdmin(): void {
  if (getApps().length > 0) {
    app = getApps()[0]!;
    auth = getAuth(app);
    return;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  // Handle various escaping formats from environment variables
  if (privateKey) {
    // If the key is JSON-encoded (wrapped in quotes), parse it first
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      try {
        privateKey = JSON.parse(privateKey);
      } catch {
        // Not valid JSON, continue with manual replacement
      }
    }
    // Replace literal \n sequences with actual newlines
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  if (!projectId || !clientEmail || !privateKey) {
    console.warn(
      'Firebase Admin: Missing credentials (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY). Firebase Auth will not work.'
    );
    // Initialize with project ID only for development/testing
    if (projectId) {
      app = initializeApp({ projectId });
    } else {
      app = initializeApp();
    }
    auth = getAuth(app);
    return;
  }

  app = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });

  auth = getAuth(app);
  console.log(`Firebase Admin initialized for project: ${projectId}`);
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    initFirebaseAdmin();
  }
  return auth;
}

/**
 * Verify a Firebase ID token and return the decoded claims
 */
export async function verifyFirebaseToken(idToken: string) {
  const firebaseAuth = getFirebaseAuth();
  return firebaseAuth.verifyIdToken(idToken);
}

/**
 * Get a Firebase user by their UID
 */
export async function getFirebaseUser(uid: string) {
  const firebaseAuth = getFirebaseAuth();
  return firebaseAuth.getUser(uid);
}
