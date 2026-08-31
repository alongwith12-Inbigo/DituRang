import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth();

/**
 * Validates connection to Firestore as per instructions
 */
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error: any) {
    if (error?.code === 'unavailable' || error?.message?.includes('the client is offline') || error?.message?.includes('Could not reach Cloud Firestore')) {
      // Handled: Firestore will automatically operate in cache mode and retry connection
      console.warn("Firestore connection initializing or running in offline mode.");
    } else {
      console.warn("Firestore test connection check:", error?.message || error);
    }
  }
}

testConnection();
