import { GoogleSignin } from '@react-native-google-signin/google-signin';
import {
  GoogleAuthProvider,
  signInWithCredential,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from './config';
import type { User } from '../../types';

GoogleSignin.configure({
  webClientId: '611310540307-f7tm4vb84oe3coloom9fkehqob34fh1q.apps.googleusercontent.com',
});

export async function signInWithGoogle(): Promise<User> {
  await GoogleSignin.hasPlayServices();
  const { data } = await GoogleSignin.signIn();
  const credential = GoogleAuthProvider.credential(data?.idToken ?? null);
  const result = await signInWithCredential(auth, credential);

  const user: User = {
    uid: result.user.uid,
    displayName: result.user.displayName,
    email: result.user.email,
    photoURL: result.user.photoURL,
    isGuest: false,
  };

  await upsertUser(user);
  return user;
}

export async function registerWithEmail(
  email: string,
  password: string,
  displayName: string
): Promise<User> {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(result.user, { displayName });

  const user: User = {
    uid: result.user.uid,
    displayName,
    email: result.user.email,
    photoURL: null,
    isGuest: false,
  };

  try {
    await upsertUser(user);
  } catch (e) {
    console.warn('[registerWithEmail] kullanıcı profili oluşturulamadı:', e);
  }
  return user;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const result = await signInWithEmailAndPassword(auth, email, password);

  const fallback: User = {
    uid: result.user.uid,
    displayName: result.user.displayName,
    email: result.user.email,
    photoURL: result.user.photoURL,
    isGuest: false,
  };

  try {
    const snap = await getDoc(doc(db, 'users', result.user.uid));
    if (snap.exists()) {
      const data = snap.data() as User;
      return {
        ...data,
        uid: fallback.uid,
        isGuest: false,
        displayName: data.displayName ?? fallback.displayName,
        email: data.email ?? fallback.email,
        photoURL: data.photoURL ?? fallback.photoURL,
      };
    }
    await upsertUser(fallback);
  } catch (e) {
    console.warn('[auth] kullanıcı profili okunamadı, temel bilgilerle devam ediliyor:', e);
  }

  return fallback;
}

export async function signInAsGuest(): Promise<User> {
  const result = await signInAnonymously(auth);
  const user: User = {
    uid: result.user.uid,
    displayName: 'Misafir',
    email: null,
    photoURL: null,
    isGuest: true,
  };
  await upsertUser(user);
  return user;
}

export async function signOut(): Promise<void> {
  const isGoogle = !auth.currentUser?.isAnonymous && auth.currentUser?.providerData[0]?.providerId === 'google.com';
  await firebaseSignOut(auth);
  if (isGoogle) {
    try {
      await GoogleSignin.signOut();
    } catch (e) {
      console.warn('[signOut] Google oturumu kapatılamadı:', e);
    }
  }
}

async function upsertUser(user: User): Promise<void> {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) await setDoc(ref, { ...user, createdAt: new Date() });
}
