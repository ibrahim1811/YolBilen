import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: 'AIzaSyDw4x2JyIknhp94h6PMs3CAhfKpOTtOR-E',
  authDomain: 'yolbulan.firebaseapp.com',
  projectId: 'yolbulan',
  storageBucket: 'yolbulan.firebasestorage.app',
  messagingSenderId: '611310540307',
  appId: '1:611310540307:android:15e3e78792f8579d7391e6',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

function createAuth() {
  try {
    // getReactNativePersistence — Metro RN bundle'da var, Node/web types'da yok
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getReactNativePersistence } = require('firebase/auth') as any;
    if (typeof getReactNativePersistence === 'function') {
      return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
    }
  } catch {}
  return getAuth(app);
}

export { app };
export const auth = createAuth();
export const db = getFirestore(app);
