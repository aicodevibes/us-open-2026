import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import firebaseConfig from '../firebase-applet-config.json';

function getAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  // If a service account key is provided (local dev), use it.
  // Otherwise, use Application Default Credentials (Cloud Run).
  const serviceAccountKey = process.env.SERVICE_ACCOUNT_KEY;
  if (serviceAccountKey) {
    try {
      const serviceAccount = JSON.parse(serviceAccountKey);
      return initializeApp({
        credential: cert(serviceAccount),
        projectId: firebaseConfig.projectId,
      });
    } catch (e) {
      console.error('Failed to parse SERVICE_ACCOUNT_KEY, falling back to ADC');
    }
  }

  return initializeApp({
    credential: applicationDefault(),
    projectId: firebaseConfig.projectId,
  });
}

const adminApp = getAdminApp();
export const adminDb = getFirestore(adminApp);
export const adminAuth = getAuth(adminApp);
