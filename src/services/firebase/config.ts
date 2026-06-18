import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDw4x2JyIknhp94h6PMs3CAhfKpOTtOR-E',
  authDomain: 'yolbulan.firebaseapp.com',
  projectId: 'yolbulan',
  storageBucket: 'yolbulan.firebasestorage.app',
  messagingSenderId: '611310540307',
  appId: '1:611310540307:android:15e3e78792f8579d7391e6',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export { app };
export const auth = getAuth(app);
export const db = getFirestore(app);
